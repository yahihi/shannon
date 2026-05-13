We are building shannon, a CLI wrapper around the claude cli that enables behavior matching claude-agent-sdk and claude -p, without needing to use those


basic use case:

```
shannon -p "hi i'm tom" --output-format=stream-json --verbose
```

outputs

```
{...json lines... same as from agent sdk}
```


sdk version:

```
import { query } from "@humanlayer/shannon"

for await (const message of query({
  prompt: "hi i'm tom",
  options: {
    outputFormat: "stream-json",
    verbose: true,
  },
})) {
  console.log(JSON.stringify(message))
}
```


### design

we must do this without claude -p, so under the hood, shannon launches a full `claude` interative cli session.

1. open new tmux session
2. launch claude cli sesison there
3. get the session id, either
      a. use tmux capture-pane to get the session id
      b. ls ~/.claude/... in the projects path for the working directory before and after launch and find the new directory
      c. something else clever
4. stream out JSONL events in the claude -p json lines output format
5. kill the tmux pane or leave it open, print the session id etc at the end
6. eventually, will want do use tmux send-keys to allow conversation continuation

### things to research with codebash/node_modules analysis

how does claude agent sdk invoke / pass flags to the claude -p binary and handle bidi stdio streaming

### things to research with learning tests

how does claude -p emit json lines w/ the above stream/verbose flags, whats the format and full lexicon of event types (can inspect the tools list)

how does data get written to disk for new claude -p sessions and how does it differ from the stdio output/input channels

how does data get writte to disk when launching interactive (claude w/o -p) sessions in a separate tmux process


### other things to consider (added after initial /goal invocation, but should be included in scope)

1. validating claude and tmux are installed
2. handling errors from claude like "needs login" or "first time use, walkthing you through setup steps - can probably use capture-pane or more cleanly, check the internal claude config surface like ~/.claude.json or ~/.claude/ directory full of metatdata
3. use commander for CLI flags and command tree parsing
4. publish to npm under @humanlayer/shannon and @humanlayer/shannon-agent-sdk
5. push to github public repo humanlayer/shannon
6. shannon agent-sdk support with full zod schemas etc
7. support for every claude -p and claude-agent-sdk feature - via an extensive and growing set of conformance tests that can be run (use haiku model to save $$ please)
