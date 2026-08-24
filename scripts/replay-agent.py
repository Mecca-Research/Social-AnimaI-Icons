"""Replay an agent transcript's file mutations onto a fresh worktree.

WHY THIS EXISTS. The container has silently reverted this checkout more than
once, and on 2026-08-24 it took three agent worktrees with it — about eight
hours of finished, tested, UNCOMMITTED work. The repo was recoverable from
the remote; the worktrees were not. But the subagent transcripts under
~/.claude/projects/<project>/<session>/subagents/ survived, and every Write,
every Edit and every heredoc an agent ran is recorded in them. All three
branches were rebuilt from those transcripts, byte for byte.

    python3 scripts/replay-agent.py <transcript.jsonl> <worktree-path> [dry]

Create the worktree at the agent's ORIGINAL absolute path first, at the
commit it branched from — the agent's own commands contain absolute paths
and only work if the tree is back where it was:

    git worktree add -f -b salvage-x .claude/worktrees/agent-<id> <base-sha>

Only operations whose ORIGINAL tool_result reported success are replayed: a
call the harness refused the first time must not be run now. For Bash, only
the mutating FRAGMENTS are executed — heredocs, `sed -i`, and redirects into
the tree — never the whole command, because agents routinely chain a
file-rewriting heredoc onto `node scripts/checktests.mjs`.

The real lesson is upstream of this script: an agent's work is not delivered
until it is committed and pushed. Have them commit.
"""
import json, os, subprocess, sys, re

TRANS, WT, MODE = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else 'run')

FORBIDDEN = re.compile(r'(^|[;&|(\s])(git|npm|npx|node|pkill|kill|curl|wget|rm)\s')
MUTATES = re.compile(r"(<<\s*'?\"?(PY|EOF|CSSEOF|JS|SH|TXT)|sed -i|tee\s|>>?\s*\S*(app/src/|tests/|scripts/))")

def text_of(c):
    if isinstance(c, str): return c
    if isinstance(c, list):
        return ''.join(x.get('text', '') for x in c if isinstance(x, dict))
    return ''

# ---- pass 1: index tool_use blocks and their results, in order --------
uses, order, results = {}, [], {}
for line in open(TRANS, encoding='utf-8'):
    try: r = json.loads(line)
    except Exception: continue
    m = r.get('message')
    if not isinstance(m, dict): continue
    for blk in (m.get('content') or []):
        if not isinstance(blk, dict): continue
        if blk.get('type') == 'tool_use':
            uses[blk['id']] = blk; order.append(blk['id'])
        elif blk.get('type') == 'tool_result':
            results[blk.get('tool_use_id')] = blk

def ok(tid):
    res = results.get(tid)
    if res is None: return False
    if res.get('is_error'): return False
    t = text_of(res.get('content'))
    bad = ('This agent is isolated', '<tool_use_error>', 'String to replace not found',
           'has not been read yet', 'Found 0 matches', 'no changes made')
    return not any(b in t for b in bad)

log = []
def note(kind, tid, what, detail=''):
    log.append(f'{kind:7} {what}{(" :: " + detail) if detail else ""}')

# ---- pass 2: replay ---------------------------------------------------
for tid in order:
    b = uses[tid]; name = b.get('name'); inp = b.get('input') or {}
    if name not in ('Write', 'Edit', 'MultiEdit', 'Bash'): continue
    if not ok(tid):
        note('skip-err', tid, f'{name} (original failed/refused)',
             (inp.get('file_path') or inp.get('command', ''))[:70].replace('\n', ' '))
        continue

    if name in ('Write', 'Edit', 'MultiEdit'):
        fp = inp.get('file_path', '')
        if not fp.startswith(WT) and name != 'Write':
            note('skip-out', tid, f'{name} outside worktree', fp[-50:]); continue
        rel = fp[len(WT):].lstrip('/') if fp.startswith(WT) else '(scratch) ' + os.path.basename(fp)
        if MODE == 'run':
            os.makedirs(os.path.dirname(fp), exist_ok=True)
        if name == 'Write':
            if MODE == 'run':
                open(fp, 'w', encoding='utf-8').write(inp.get('content', ''))
            note('write', tid, rel, f'{len(inp.get("content",""))}B')
        else:
            edits = inp.get('edits') or [inp]
            for e in edits:
                old, new = e.get('old_string', ''), e.get('new_string', '')
                if not os.path.exists(fp):
                    note('EDIT-MISS', tid, rel, 'file absent'); continue
                s = open(fp, encoding='utf-8').read()
                n = s.count(old)
                if n == 0:
                    note('EDIT-MISS', tid, rel, repr(old[:60])); continue
                if MODE == 'run':
                    s = s.replace(old, new) if e.get('replace_all') else s.replace(old, new, 1)
                    open(fp, 'w', encoding='utf-8').write(s)
                note('edit', tid, rel, f'{n} match(es)')
    else:
        cmd = inp.get('command', '')
        # Run ONLY the mutation fragments of a shell command, never the whole
        # thing: agents routinely chain a file-rewriting heredoc onto `node
        # scripts/checktests.mjs`, and the verb guard was throwing the baby out.
        frags = []
        for m in re.finditer(r"((?:python3|python)\s+-\s*|cat\s*>>?\s*\S+\s*)<<\s*'?\"?(\w+)'?\"?\n(.*?)\n\2(?:\n|$)",
                             cmd, flags=re.S):
            frags.append(m.group(0))
        for line in cmd.split('\n'):
            ls = line.strip()
            if re.match(r"sed -i", ls) and not FORBIDDEN.search(ls):
                frags.append(ls)
            # `cat scratch.css >> app/src/index.css` — how both CSS blocks
            # actually landed, after the harness refused the inline heredoc
            elif re.match(r"(cat|cp|printf|echo)\s+\S+\s*>>?\s*\S+$", ls) and '<<' not in ls:
                frags.append(ls)
        if not frags:
            continue
        cwd = WT
        mcd = re.match(r"\s*cd\s+(\S+)\s*&&", cmd)
        if mcd:
            cwd = mcd.group(1)
            if not os.path.isdir(cwd):
                note('skip-cwd', tid, 'cd target gone', cwd[-45:]); continue
        for fr in frags:
            if MODE != 'run':
                note('bash', tid, fr[:70].replace('\n', ' ')); continue
            try:
                pr = subprocess.run(['bash', '-c', fr], cwd=cwd, capture_output=True,
                                    text=True, timeout=180)
            except Exception as ex:
                note('BASH-ERR', tid, fr[:60].replace('\n', ' '), str(ex)[:100]); continue
            st = 'bash-ok' if pr.returncode == 0 else 'BASH-ERR'
            note(st, tid, fr[:70].replace('\n', ' '),
                 (pr.stderr or pr.stdout)[:130].replace('\n', ' '))

print('\n'.join(log))
print(f'\n-- {sum(1 for l in log if l.startswith(("write","edit","bash-ok")))} applied, '
      f'{sum(1 for l in log if "MISS" in l or "ERR" in l)} problems')
