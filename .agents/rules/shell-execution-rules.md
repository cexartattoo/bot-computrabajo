---
trigger: always_on
---

=== SHELL EXECUTION RULES ===

1. COMMAND CHAINING:

   - Always use ';' to separate multiple commands. NEVER use '&&' or '||'.
   - Example: npm install ; npm run build ; npm run test
2. SHELL TERMINATION (Windows):

   - Always prefix shell commands with 'cmd /c' to ensure the process
     terminates and sends an EOF signal correctly.
   - Example: cmd /c pip list | cmd /c npm install
3. AVOID INTERACTIVE SHELLS:

   - Never launch commands that require user input or keep the shell open.
   - If a persistent session is needed, ensure the command is self-terminating.

=== AGENT BEHAVIOR RULES ===

4. STUCK / TIMEOUT HANDLING:

   - If a command has been running for more than 30 seconds without output,
     assume it has silently failed. Cancel and retry with ';' separation.
   - Never wait indefinitely for a command response.
5. CONTEXT LENGTH:

   - If the conversation is getting long and previous rules seem forgotten,
     restate the active shell rules before issuing new commands.
6. PARALLEL TASKS:

   - When spawning sub-agents or parallel tasks, assign each agent its own
     isolated workspace to avoid terminal conflicts.
   - Each agent should operate on its own terminal panel — never share panels.

=== ERROR HANDLING RULES ===

7. EXIT CODES:

   - Do not assume exit code 0. Always check command output for errors
     before proceeding to the next step.
   - If a command fails, report the error explicitly and stop — do not
     silently continue to the next command.
8. OUTPUT PANEL:

   - On any unexpected hang or error, first check View → Output →
     "Antigravity Agent" for the root cause before retrying.
9. no usar emojis 