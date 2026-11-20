# Setting up the Flour and Flame Head Baker GPT (ChatGPT)

Needs a ChatGPT plan that can create GPTs. About 10 minutes.

1. In ChatGPT, open **GPTs → Create**, then the **Configure** tab.
2. **Name:** Flour and Flame Head Baker
3. **Description:** My recipe developer and business partner for salty-sweet cookies, brownies and cupcakes, built for Illinois cottage food rules and my Flour and Flame app.
4. **Instructions:** paste everything in `GPT-INSTRUCTIONS.txt` (about 6,200 characters; the limit is 8,000).
5. **Knowledge:** upload these files:
   - `1-flour-and-flame-app.md`
   - `2-illinois-rules-and-business.md`
   - `3-baking-and-pricing-playbook.md`
   - the official 2026 Illinois Cottage Food Guide PDF: https://extension.illinois.edu/media/9376/download
   - the 2026 addendum PDF: https://extension.illinois.edu/media/9378/download
6. **Capabilities:** turn on **Web search** (so it can check rules that change) and **Code Interpreter & Data Analysis** (for cost and pricing math and sales summaries). Image generation is optional.
7. **Conversation starters:**
   - Let's develop a new salty-sweet cookie. Start with the brief.
   - Is this frosting allowed under Illinois cottage food law?
   - Here's my sales summary. What sells most vs. profits most?
   - Export my approved changes for the app.
8. Set sharing to **Only me**, then **Create**.

**Using it with the app:** when a recipe is ready, say **"export"**. Copy the JSON code block, then in the app go to **Recipes → Import**, paste it, tap **Check**, review the preview and confirm. Updating a recipe it exported before? It reuses the same id, so the app offers **Save as a new version**.

**Keeping it current:** when the app changes (new fields, new categories) or the law changes, replace the knowledge files with the updated versions from the project's `docs/gpt` folder.
