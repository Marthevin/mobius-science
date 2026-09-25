#!/usr/bin/env python3
"""Freeze, check, and build an auditable evidence review from local text snapshots.

This verifies identity, quoted bytes and stated reviewer decisions. It cannot
judge whether the source actually entails a claim or whether a search is complete.
"""

import argparse
import hashlib
import json
from pathlib import Path


LOCKED_FILES = ("review-plan.json", "searches.jsonl", "coverage.jsonl",
                "sources.jsonl", "claims.jsonl")
STANCES = {"supports", "contradicts", "mentions"}
DIRECTNESS = {"direct", "indirect"}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines()
            if line.strip()]


def write_json(path, data):
    Path(path).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def checked_path(root, relative):
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
        raise ValueError(f"Unsafe snapshot path: {relative}")
    raw = root
    for part in Path(relative).parts:
        if part == "..":
            raise ValueError(f"Unsafe snapshot path: {relative}")
        raw = raw / part
        if raw.is_symlink():
            raise ValueError(f"Symbolic links are not allowed in snapshots: {relative}")
    path = raw.resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f"Unsafe or missing snapshot path: {relative}")
    return path


def unique(rows, key, name):
    ids = [row.get(key) for row in rows]
    if any(not isinstance(value, str) or not value.strip() for value in ids):
        raise ValueError(f"{name} has missing {key}")
    if len(ids) != len(set(ids)):
        raise ValueError(f"{name} has duplicate {key}")
    return {row[key]: row for row in rows}


def validate_corpus(root):
    plan = read_json(root / "review-plan.json")
    for key in ("question", "cutoff", "eligibility"):
        if not isinstance(plan.get(key), str) or not plan[key].strip():
            raise ValueError(f"review-plan.json missing {key}")
    if plan.get("schema_version") != 1 or plan.get("review_type") not in ("narrative", "scoping", "systematic"):
        raise ValueError("Unsupported review plan schema or type")
    searches = read_jsonl(root / "searches.jsonl")
    if not searches or any(not x.get("database") or not x.get("query") or not x.get("searched_at")
                           or not isinstance(x.get("hits"), int) or x["hits"] < 0 for x in searches):
        raise ValueError("Search log must contain reproducible queries and hit counts")
    coverage = unique(read_jsonl(root / "coverage.jsonl"), "axis", "coverage")
    axes = plan.get("coverage_axes")
    if not isinstance(axes, list) or not axes or set(axes) != set(coverage):
        raise ValueError("Coverage matrix must account for every planned axis")
    for axis, item in coverage.items():
        if item.get("status") not in ("evidence", "searched_empty", "not_applicable") or not item.get("note"):
            raise ValueError(f"Coverage axis {axis} needs a status and reason")
    sources = unique(read_jsonl(root / "sources.jsonl"), "id", "sources")
    if not sources:
        raise ValueError("No eligible sources")
    for sid, item in sources.items():
        for key in ("title", "url", "study_id", "cohort_id", "snapshot"):
            if not isinstance(item.get(key), str) or not item[key].strip():
                raise ValueError(f"Source {sid} missing {key}")
        if item.get("kind") not in ("primary", "secondary", "guideline", "preprint"):
            raise ValueError(f"Source {sid} has unsupported kind")
        pages = read_jsonl(checked_path(root, item["snapshot"]))
        if not pages or any(not isinstance(x.get("page"), int) or x["page"] < 1
                            or not isinstance(x.get("text"), str) for x in pages):
            raise ValueError(f"Source {sid} has invalid page snapshot")
        unique([{"page": str(x["page"])} for x in pages], "page", f"source {sid} pages")
    claims = unique(read_jsonl(root / "claims.jsonl"), "id", "claims")
    if not claims:
        raise ValueError("No review claims")
    for cid, claim in claims.items():
        if not claim.get("text") or claim.get("axis") not in coverage:
            raise ValueError(f"Claim {cid} lacks text or a planned coverage axis")
    return plan, searches, coverage, sources, claims


def freeze(directory):
    root = Path(directory).resolve()
    _, _, _, sources, _ = validate_corpus(root)
    files = list(LOCKED_FILES) + sorted({x["snapshot"] for x in sources.values()})
    locked = {name: digest(checked_path(root, name)) for name in files}
    locked["@skill-script"] = digest(Path(__file__))
    lock = {"schema_version": 1, "files": locked}
    write_json(root / "corpus.lock.json", lock)
    return lock


def verify_lock(root):
    lock = read_json(root / "corpus.lock.json")
    if lock.get("schema_version") != 1 or not isinstance(lock.get("files"), dict):
        raise ValueError("Invalid corpus lock")
    for name, expected in lock["files"].items():
        path = Path(__file__) if name == "@skill-script" else checked_path(root, name)
        if digest(path) != expected:
            raise ValueError(f"Corpus or skill script hash changed: {name}")
    _, _, _, sources, claims = validate_corpus(root)
    expected = set(LOCKED_FILES) | {x["snapshot"] for x in sources.values()} | {"@skill-script"}
    if set(lock["files"]) != expected:
        raise ValueError("Corpus lock does not match source list")
    return sources, claims, lock


def checked_evidence(root, sources, claims):
    rows = unique(read_jsonl(root / "evidence.jsonl"), "id", "evidence")
    for eid, row in rows.items():
        sid, cid = row.get("source_id"), row.get("claim_id")
        if sid not in sources or cid not in claims:
            raise ValueError(f"Evidence {eid} references unknown source or claim")
        if row.get("stance") not in STANCES or row.get("directness") not in DIRECTNESS:
            raise ValueError(f"Evidence {eid} has invalid stance or directness")
        if not row.get("reviewer") or not isinstance(row.get("page"), int) or not row.get("quote"):
            raise ValueError(f"Evidence {eid} lacks reviewer, page, or exact quote")
        pages = {item["page"]: item["text"] for item in read_jsonl(
            checked_path(root, sources[sid]["snapshot"]))}
        if row["page"] not in pages or row["quote"] not in pages[row["page"]]:
            raise ValueError(f"Evidence {eid} quote is not on the stated page")
    return rows


def blind_packet(directory):
    root = Path(directory).resolve()
    sources, claims, _ = verify_lock(root)
    rows = checked_evidence(root, sources, claims)
    pages_by_source = {
        sid: {item["page"]: item["text"] for item in read_jsonl(
            checked_path(root, source["snapshot"]))}
        for sid, source in sources.items()
    }
    packet = [{"evidence_id": eid, "claim": claims[row["claim_id"]]["text"],
               "source_id": row["source_id"], "source_title": sources[row["source_id"]]["title"],
               "page": row["page"], "page_text": pages_by_source[row["source_id"]][row["page"]],
               "quote": row["quote"]}
              for eid, row in sorted(rows.items())]
    (root / "blind-packet.jsonl").write_text("".join(
        json.dumps(x, ensure_ascii=False) + "\n" for x in packet), encoding="utf-8")
    return packet


def build(directory):
    root = Path(directory).resolve()
    sources, claims, lock = verify_lock(root)
    evidence = checked_evidence(root, sources, claims)
    verdicts = unique(read_jsonl(root / "blind-verdicts.jsonl"), "evidence_id", "blind verdicts")
    if set(verdicts) != set(evidence):
        raise ValueError("Every evidence row needs exactly one second-pass verdict")
    usable = []
    excluded = []
    for eid, row in sorted(evidence.items()):
        verdict = verdicts[eid]
        if verdict.get("stance") not in STANCES or verdict.get("directness") not in DIRECTNESS:
            raise ValueError(f"Invalid second-pass verdict: {eid}")
        if not verdict.get("rationale") or not verdict.get("reviewer") or verdict["reviewer"] == row["reviewer"]:
            raise ValueError(f"Second-pass verdict needs a distinct reviewer label and rationale: {eid}")
        if verdict["stance"] != row["stance"] or verdict["directness"] != row["directness"]:
            excluded.append(eid)
        else:
            usable.append(row)
    states = {}
    for cid, claim in sorted(claims.items()):
        rows = [row for row in usable if row["claim_id"] == cid]
        direct_support = {sources[row["source_id"]]["cohort_id"] for row in rows
                          if row["stance"] == "supports" and row["directness"] == "direct"
                          and sources[row["source_id"]]["kind"] == "primary"}
        direct_against = {sources[row["source_id"]]["cohort_id"] for row in rows
                          if row["stance"] == "contradicts" and row["directness"] == "direct"
                          and sources[row["source_id"]]["kind"] == "primary"}
        indirect_support = any(row["stance"] == "supports" for row in rows)
        if direct_support and direct_against:
            status = "C_CONFLICTED"
        elif direct_against:
            status = "C_REFUTED"
        elif len(direct_support) >= 2:
            status = "C2_CONVERGENT"
        elif direct_support:
            status = "C1_SINGLE_DIRECT"
        elif indirect_support:
            status = "C1_INDIRECT"
        else:
            status = "C_INSUFFICIENT"
        states[cid] = {"text": claim["text"], "status": status,
                       "axis": claim["axis"],
                       "sources": sorted({row["source_id"] for row in rows
                                          if row["stance"] != "mentions"}),
                       "independent_direct_support_cohorts": len(direct_support)}
    output = {"schema_version": 1, "question": read_json(root / "review-plan.json")["question"],
              "claims": states, "excluded_evidence": excluded,
              "corpus_lock_sha256": digest(root / "corpus.lock.json"),
              "evidence_sha256": digest(root / "evidence.jsonl"),
              "blind_verdicts_sha256": digest(root / "blind-verdicts.jsonl")}
    write_json(root / "claim-states.json", output)
    lines = [f"# {output['question']}", "", "Evidence status is a screening aid, not an automated semantic verdict.", ""]
    for cid, state in states.items():
        lines += [f"## {cid}: {state['text']}", "", f"Status: **{state['status']}**.", ""]
        for row in sorted((x for x in usable if x["claim_id"] == cid), key=lambda x: x["id"]):
            source = sources[row["source_id"]]
            lines += [f"- {row['stance']} ({row['directness']}): “{row['quote']}” "
                      f"— {source['title']}, p. {row['page']} ({source['url']}; {row['id']})."]
        lines.append("")
    if excluded:
        lines += ["## Unresolved second-pass disagreements", "", ", ".join(excluded), ""]
    (root / "review.md").write_text("\n".join(lines), encoding="utf-8")
    write_json(root / "audit.json", {"corpus_lock_sha256": output["corpus_lock_sha256"],
                                     "claim_states_sha256": digest(root / "claim-states.json"),
                                     "review_sha256": digest(root / "review.md"),
                                     "excluded_evidence": excluded,
                                     "warning": "Quote matching and hashes do not prove entailment, independence, or search completeness."})
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("freeze", "blind-packet", "build"))
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args()
    print(json.dumps({"freeze": freeze, "blind-packet": blind_packet, "build": build}[args.action](args.run_dir),
                     ensure_ascii=False, indent=2))
