#!/usr/bin/env python3
"""
HanLP Native Bridge for conversion-skill
Provides an optional local Python bridge to `hanlp` (Native API) or `hanlp_restful`.
"""

from __future__ import annotations
import argparse
import json
import sys
from typing import Any, Dict, List, Optional


def load_custom_dict(path: Optional[str]) -> Dict[str, List[str]]:
    if not path:
        return {"force": [], "combine": []}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return {"force": [str(x) for x in data], "combine": []}
            if isinstance(data, dict):
                return {
                    "force": [str(x) for x in data.get("force", [])],
                    "combine": [str(x) for x in data.get("combine", [])],
                }
    except Exception:
        pass
    return {"force": [], "combine": []}


def run_hanlp_restful(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        from hanlp_restful import HanLPClient  # type: ignore
    except ImportError:
        return None

    url = payload.get("url") or "https://www.hanlp.com/api"
    auth = payload.get("auth") or None
    language = payload.get("language") or "zh"
    text = payload.get("text") or ""
    tasks = payload.get("tasks") or ["tok/fine", "pos/ctb", "ner/msra", "srl", "dep"]

    client = HanLPClient(url, auth=auth, language=language)
    doc = client.parse(text, tasks=tasks)

    result: Dict[str, Any] = {"backend": "hanlp_restful", "document": dict(doc)}
    if payload.get("extract_keyphrases"):
        try:
            result["keyphrases"] = client.keyphrase_extraction(text, topk=payload.get("topk", 8))
        except Exception:
            result["keyphrases"] = {}
    if payload.get("sts_pairs"):
        try:
            result["sts_scores"] = client.semantic_textual_similarity(payload["sts_pairs"])
        except Exception:
            result["sts_scores"] = []
    if payload.get("summarize"):
        try:
            result["summary"] = client.extractive_summarization(text, topk=3)
        except Exception:
            result["summary"] = {}
    return result


def run_hanlp_native(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    try:
        import hanlp  # type: ignore
    except ImportError:
        return None

    text = payload.get("text") or ""
    model_name = payload.get("model") or "CLOSE_TOK_POS_NER_SRL_DEP_SDP_CON_ELECTRA_SMALL_ZH"
    tasks = payload.get("tasks") or ["tok/fine", "pos/ctb", "ner/msra", "srl", "dep"]
    custom_dict = load_custom_dict(payload.get("custom_dict_path"))

    sentences = hanlp.utils.rules.split_sentence(text)
    if not sentences:
        sentences = [text] if text.strip() else []

    mtl = hanlp.load(getattr(hanlp.pretrained.mtl, model_name, model_name))
    if custom_dict["force"] and "tok/fine" in mtl.tasks:
        mtl["tok/fine"].dict_force = set(custom_dict["force"])
    if custom_dict["combine"] and "tok/fine" in mtl.tasks:
        mtl["tok/fine"].dict_combine = set(custom_dict["combine"])

    doc = mtl(sentences, tasks=tasks)
    return {
        "backend": "hanlp_native",
        "sentences": list(sentences),
        "document": dict(doc),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="HanLP Native/RESTful Python Bridge for conversion-skill")
    parser.add_argument("--mode", choices=["auto", "native", "restful"], default="auto")
    args = parser.parse_args()

    raw_input = sys.stdin.read().strip()
    if not raw_input:
        print(json.dumps({"ok": False, "error": "Empty stdin payload"}))
        return 1

    try:
        payload = json.loads(raw_input)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": f"Invalid JSON: {exc}"}))
        return 1

    mode = payload.get("mode") or args.mode
    out: Optional[Dict[str, Any]] = None

    if mode in ("native", "auto"):
        try:
            out = run_hanlp_native(payload)
        except Exception as exc:
            if mode == "native":
                print(json.dumps({"ok": False, "error": f"Native HanLP failed: {exc}"}))
                return 1

    if out is None and mode in ("restful", "auto"):
        try:
            out = run_hanlp_restful(payload)
        except Exception as exc:
            if mode == "restful":
                print(json.dumps({"ok": False, "error": f"RESTful HanLP failed: {exc}"}))
                return 1

    if out is None:
        print(json.dumps({"ok": False, "fallback": True, "reason": "Neither hanlp nor hanlp_restful available"}))
        return 0

    out["ok"] = True
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
