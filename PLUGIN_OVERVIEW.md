This is a development scaffold for a Todoist integration with BB.
Todoist authentication, API access, and synchronization are not implemented.
The features below describe the generated local example only.

## What you get

- An **Example todos** page in the left sidebar that adds, completes, and
  removes todos.
- A `bb todoist` command that does the same from a terminal.
- Live updates, so a change made in one place reaches every open page at once.

## How it works

The todos live in this plugin's own storage on the BB server, one list per
installation. Nothing leaves the machine, and the plugin needs no account, API
key, or external service.

## For agents

The bundled skill tells an agent to read the list with `bb todoist list`, add
one todo at a time with `bb todoist add`, and close finished work with
`bb todoist done`.
