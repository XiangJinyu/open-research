#!/usr/bin/env python3
"""Feishu CLI for agent use. Zero external dependencies.

Reads FEISHU_APP_ID and FEISHU_APP_SECRET from environment.
Token is cached in /tmp/feishu_token_cache.json (valid 2 hours).

Commands:
  send-message   --chat-id <id> --text <text> [--msg-type text|post]
  reply-message  --msg-id <id> --text <text>
  list-messages  --chat-id <id> [--limit 20]
  add-reaction   --msg-id <id> --emoji <THUMBSUP|OK|CLAPPING|...>
  del-reaction   --msg-id <id> --reaction-id <id>
  get-members    --chat-id <id> [--limit 100]
  list-chats     [--limit 20]
  get-chat       --chat-id <id>
  create-doc     --title <title> [--folder-token <token>]
  get-doc        --doc-token <token>
  list-docs      [--folder-token <token>] [--limit 20]
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = "https://open.feishu.cn/open-apis"
TOKEN_CACHE = Path("/tmp/feishu_token_cache.json")


# ---------------------------------------------------------------------------
# Token management
# ---------------------------------------------------------------------------

def _get_credentials():
    app_id = os.environ.get("FEISHU_APP_ID", "")
    app_secret = os.environ.get("FEISHU_APP_SECRET", "")
    if not app_id or not app_secret:
        sys.exit("Error: FEISHU_APP_ID and FEISHU_APP_SECRET must be set.")
    return app_id, app_secret


def _load_cached_token(app_id):
    try:
        data = json.loads(TOKEN_CACHE.read_text())
        if data.get("app_id") == app_id and data.get("expires_at", 0) > time.time() + 60:
            return data["token"]
    except Exception:
        pass
    return None


def _save_token(app_id, token, expires_in):
    TOKEN_CACHE.write_text(json.dumps({
        "app_id": app_id,
        "token": token,
        "expires_at": time.time() + expires_in,
    }))


def get_token():
    app_id, app_secret = _get_credentials()
    cached = _load_cached_token(app_id)
    if cached:
        return cached

    body = json.dumps({"app_id": app_id, "app_secret": app_secret}).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/auth/v3/tenant_access_token/internal",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())

    if data.get("code") != 0:
        sys.exit(f"Token error: {data}")

    token = data["tenant_access_token"]
    _save_token(app_id, token, data.get("expire", 7200))
    return token


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def api_get(path, params=None):
    token = get_token()
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.exit(f"HTTP {e.code} GET {path}: {body}")


def api_post(path, body, params=None):
    token = get_token()
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.exit(f"HTTP {e.code} POST {path}: {body}")


def api_delete(path, params=None):
    token = get_token()
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="DELETE")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        sys.exit(f"HTTP {e.code} DELETE {path}: {body}")


def ok(data):
    code = data.get("code", -1)
    if code != 0:
        sys.exit(f"API error {code}: {data.get('msg', data)}")
    return data.get("data", {})


# ---------------------------------------------------------------------------
# Commands — messages
# ---------------------------------------------------------------------------

def cmd_send_message(args):
    if args.msg_type == "post":
        content = json.dumps({
            "zh_cn": {"title": "", "content": [[{"tag": "text", "text": args.text}]]}
        })
    else:
        content = json.dumps({"text": args.text})

    res = api_post("/im/v1/messages", {
        "receive_id": args.chat_id,
        "msg_type": args.msg_type,
        "content": content,
    }, params={"receive_id_type": "chat_id"})
    data = ok(res)
    print(json.dumps({
        "message_id": data.get("message_id"),
        "chat_id": data.get("chat_id"),
        "create_time": data.get("create_time"),
    }, ensure_ascii=False, indent=2))


def cmd_reply_message(args):
    content = json.dumps({"text": args.text})
    res = api_post(f"/im/v1/messages/{args.msg_id}/reply", {
        "msg_type": "text",
        "content": content,
    })
    data = ok(res)
    print(json.dumps({
        "message_id": data.get("message_id"),
        "create_time": data.get("create_time"),
    }, ensure_ascii=False, indent=2))


def cmd_list_messages(args):
    params = {
        "container_id_type": "chat",
        "container_id": args.chat_id,
        "page_size": min(args.limit, 50),
        "sort_type": "ByCreateTimeDesc",
    }
    res = api_get("/im/v1/messages", params)
    data = ok(res)
    items = data.get("items", [])
    out = []
    for m in items:
        body = {}
        try:
            body = json.loads(m.get("body", {}).get("content", "{}"))
        except Exception:
            pass
        out.append({
            "message_id": m.get("message_id"),
            "sender_id": m.get("sender", {}).get("id"),
            "sender_name": m.get("sender", {}).get("id_type"),
            "msg_type": m.get("msg_type"),
            "text": body.get("text", ""),
            "create_time": m.get("create_time"),
        })
    print(json.dumps(out, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------------------
# Commands — reactions
# ---------------------------------------------------------------------------

def cmd_add_reaction(args):
    res = api_post(f"/im/v1/messages/{args.msg_id}/reactions", {
        "reaction_type": {"emoji_type": args.emoji.upper()},
    })
    data = ok(res)
    print(json.dumps({
        "reaction_id": data.get("reaction_id"),
        "emoji_type": data.get("reaction_type", {}).get("emoji_type"),
    }, ensure_ascii=False, indent=2))


def cmd_del_reaction(args):
    res = api_delete(f"/im/v1/messages/{args.msg_id}/reactions/{args.reaction_id}")
    ok(res)
    print(f"Deleted reaction {args.reaction_id}")


# ---------------------------------------------------------------------------
# Commands — chats / members
# ---------------------------------------------------------------------------

def cmd_list_chats(args):
    params = {"page_size": min(args.limit, 100)}
    res = api_get("/im/v1/chats", params)
    data = ok(res)
    items = data.get("items", [])
    out = [{
        "chat_id": c.get("chat_id"),
        "name": c.get("name"),
        "chat_type": c.get("chat_type"),
        "description": c.get("description", ""),
        "member_count": c.get("external", False),
    } for c in items]
    print(json.dumps(out, ensure_ascii=False, indent=2))


def cmd_get_chat(args):
    res = api_get(f"/im/v1/chats/{args.chat_id}")
    data = ok(res)
    print(json.dumps({
        "chat_id": data.get("chat_id"),
        "name": data.get("name"),
        "description": data.get("description"),
        "chat_type": data.get("chat_type"),
        "owner_id": data.get("owner_id"),
        "member_count": data.get("member_count"),
        "create_time": data.get("create_time"),
    }, ensure_ascii=False, indent=2))


def cmd_get_members(args):
    params = {"page_size": min(args.limit, 100)}
    res = api_get(f"/im/v1/chats/{args.chat_id}/members", params)
    data = ok(res)
    items = data.get("items", [])
    out = [{
        "member_id": m.get("member_id"),
        "name": m.get("name"),
        "member_id_type": m.get("member_id_type"),
        "tenant_key": m.get("tenant_key"),
    } for m in items]
    print(json.dumps({
        "total": len(out),
        "has_more": data.get("has_more", False),
        "members": out,
    }, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------------------
# Commands — documents
# ---------------------------------------------------------------------------

def cmd_create_doc(args):
    body = {"title": args.title}
    if args.folder_token:
        body["folder_token"] = args.folder_token
    res = api_post("/docx/v1/documents", body)
    data = ok(res)
    doc = data.get("document", {})
    print(json.dumps({
        "document_id": doc.get("document_id"),
        "title": doc.get("title"),
        "revision_id": doc.get("revision_id"),
        "url": f"https://docs.feishu.cn/docx/{doc.get('document_id')}",
    }, ensure_ascii=False, indent=2))


def cmd_get_doc(args):
    res = api_get(f"/docx/v1/documents/{args.doc_token}/raw_content")
    data = ok(res)
    content = data.get("content", "")
    print(content)


def cmd_list_docs(args):
    params = {"page_size": min(args.limit, 50)}
    if args.folder_token:
        params["folder_token"] = args.folder_token
    res = api_get("/drive/v1/files", params)
    data = ok(res)
    files = data.get("files", [])
    out = [{
        "token": f.get("token"),
        "name": f.get("name"),
        "type": f.get("type"),
        "created_time": f.get("created_time"),
        "modified_time": f.get("modified_time"),
        "url": f.get("url", ""),
    } for f in files]
    print(json.dumps(out, ensure_ascii=False, indent=2))


def cmd_edit_doc(args):
    # block_type: 2=text(paragraph), 3=heading1, 4=heading2, 5=heading3
    # Feishu key names: type2 → "text", type3 → "heading1", etc.
    style_map = {"paragraph": (2, "text"), "heading1": (3, "heading1"),
                 "heading2": (4, "heading2"), "heading3": (5, "heading3")}
    block_type, block_key = style_map.get(args.style, (2, "text"))

    block = {
        "block_type": block_type,
        block_key: {
            "elements": [{"type": "text_run", "text_run": {"content": args.text}}],
        },
    }

    res = api_post(
        f"/docx/v1/documents/{args.doc_token}/blocks/{args.doc_token}/children",
        {"children": [block], "index": -1},
    )
    data = ok(res)
    children = data.get("children", [])
    block_id = children[0].get("block_id") if children else None
    print(json.dumps({"block_id": block_id, "style": args.style, "text": args.text},
                     ensure_ascii=False, indent=2))


def cmd_comment_doc(args):
    res = api_post(
        f"/drive/v1/files/{args.doc_token}/comments",
        {
            "reply_list": {
                "replies": [
                    {
                        "content": {
                            "elements": [
                                {"type": "text_run", "text_run": {"text": args.text}}
                            ]
                        }
                    }
                ]
            }
        },
        params={"file_type": "docx"},
    )
    data = ok(res)
    comment = data.get("comment", {})
    print(json.dumps({
        "comment_id": comment.get("comment_id"),
        "content": args.text,
        "create_time": comment.get("create_time"),
    }, ensure_ascii=False, indent=2))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        prog="feishu",
        description="Feishu CLI — reads FEISHU_APP_ID / FEISHU_APP_SECRET from env.",
    )
    sub = parser.add_subparsers(dest="command", metavar="<command>")

    # send-message
    p = sub.add_parser("send-message", help="Send a message to a chat")
    p.add_argument("--chat-id", required=True)
    p.add_argument("--text", required=True)
    p.add_argument("--msg-type", default="text", choices=["text", "post"])

    # reply-message
    p = sub.add_parser("reply-message", help="Reply to a message")
    p.add_argument("--msg-id", required=True)
    p.add_argument("--text", required=True)

    # list-messages
    p = sub.add_parser("list-messages", help="List recent messages in a chat")
    p.add_argument("--chat-id", required=True)
    p.add_argument("--limit", type=int, default=20)

    # add-reaction
    p = sub.add_parser("add-reaction", help="Add an emoji reaction to a message")
    p.add_argument("--msg-id", required=True)
    p.add_argument("--emoji", required=True,
                   help="e.g. THUMBSUP, OK, CLAPPING, PARTY, LOVE, SMILE, SURPRISED, THINKING")

    # del-reaction
    p = sub.add_parser("del-reaction", help="Remove an emoji reaction")
    p.add_argument("--msg-id", required=True)
    p.add_argument("--reaction-id", required=True)

    # list-chats
    p = sub.add_parser("list-chats", help="List bot-accessible chats")
    p.add_argument("--limit", type=int, default=20)

    # get-chat
    p = sub.add_parser("get-chat", help="Get chat info")
    p.add_argument("--chat-id", required=True)

    # get-members
    p = sub.add_parser("get-members", help="List members of a group chat")
    p.add_argument("--chat-id", required=True)
    p.add_argument("--limit", type=int, default=100)

    # create-doc
    p = sub.add_parser("create-doc", help="Create a new Feishu document")
    p.add_argument("--title", required=True)
    p.add_argument("--folder-token", default=None, help="Parent folder token (optional)")

    # get-doc
    p = sub.add_parser("get-doc", help="Get document content as plain text")
    p.add_argument("--doc-token", required=True)

    # list-docs
    p = sub.add_parser("list-docs", help="List documents in Drive")
    p.add_argument("--folder-token", default=None)
    p.add_argument("--limit", type=int, default=20)

    # edit-doc
    p = sub.add_parser("edit-doc", help="Append a block of text to a document")
    p.add_argument("--doc-token", required=True)
    p.add_argument("--text", required=True)
    p.add_argument("--style", default="paragraph",
                   choices=["paragraph", "heading1", "heading2", "heading3"],
                   help="Block style (default: paragraph)")

    # comment-doc
    p = sub.add_parser("comment-doc", help="Add a whole-document comment")
    p.add_argument("--doc-token", required=True)
    p.add_argument("--text", required=True)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    dispatch = {
        "send-message": cmd_send_message,
        "reply-message": cmd_reply_message,
        "list-messages": cmd_list_messages,
        "add-reaction": cmd_add_reaction,
        "del-reaction": cmd_del_reaction,
        "list-chats": cmd_list_chats,
        "get-chat": cmd_get_chat,
        "get-members": cmd_get_members,
        "create-doc": cmd_create_doc,
        "get-doc": cmd_get_doc,
        "list-docs": cmd_list_docs,
        "edit-doc": cmd_edit_doc,
        "comment-doc": cmd_comment_doc,
    }
    dispatch[args.command](args)


if __name__ == "__main__":
    main()
