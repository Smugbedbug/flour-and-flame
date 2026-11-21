# Setting up the Flour and Flame Head Baker (ChatGPT plugin)

ChatGPT no longer lets you create new custom GPTs (they retire December 11, 2026). Plugins replace them: a GPT's instructions become a **skill**, and its knowledge files become **reference files**. These files work unchanged.

1. In ChatGPT, open **Plugins** in the sidebar (or chatgpt.com/plugins). Select **+**, then **Create plugin**. Install **Plugin Creator** if it asks.
2. Start a chat with **@plugin-creator**. Attach `GPT-INSTRUCTIONS.txt`, `1-flour-and-flame-app.md`, `2-illinois-rules-and-business.md`, `3-baking-and-pricing-playbook.md`, and the two official PDFs (2026 Illinois Cottage Food Guide https://extension.illinois.edu/media/9376/download and its addendum https://extension.illinois.edu/media/9378/download).
3. Send this message:

> Create a plugin called "Flour and Flame Head Baker". Make one skill whose instructions are exactly the text of GPT-INSTRUCTIONS.txt, word for word, without summarizing or rewording. Add the other attached files as its reference files, keeping their names and contents unchanged. Don't connect any apps. Keep it private to me.

4. Review what it built: open the skill and check that the instructions match the file. Then save it.
5. Use it in any chat by typing **@Flour and Flame Head Baker**. When a recipe is ready, say **"export"**, copy the JSON block, then in the app go to **Recipes → Import**, paste, **Check**, and confirm.

**Keeping it current:** when the app's import format or the law changes, replace the reference files with the updated versions from `docs/gpt`.
