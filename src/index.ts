import "dotenv/config";

import { GoogleGenAI } from "@google/genai";
import {
	InteractionResponseType,
	InteractionType,
	verifyKeyMiddleware,
} from "discord-interactions";
import express from "express";

const endpoint = "https://discord.com/api/v10";

const appId = process.env.APP_ID;
const publicKey = process.env.PUBLIC_KEY;
const discordToken = process.env.DISCORD_TOKEN;

if (!appId || !publicKey || !discordToken) {
	console.error(
		"APP_ID, PUBLIC_KEY and DISCORD_TOKEN must be set in environment variables.",
	);
	process.exit(1);
}

interface User {
	id: string;
	username: string;
}

interface Message {
	content: string;
	mentions: Array<User>;
	author: User;
	mention_everyone: boolean;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const app = express();

app.post("/interactions", verifyKeyMiddleware(publicKey), (req, res) => {
	const { type, data, id, channel_id, token } = req.body;

	if (type === InteractionType.PING) {
		res.send({
			type: InteractionResponseType.PONG,
		});
	}

	if (type === InteractionType.APPLICATION_COMMAND) {
		if (data.name === "summarize") {
			const days = data.options?.find(
				(option: Record<string, unknown>) => option.name === "days",
			)?.value;

			if (!days) {
				res.send({
					type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: "Please enter a number of days (1 or more).",
					},
				});

				return;
			}

			res.send({
				type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
			});

			const now = new Date();
			const nDaysAgo = new Date(
				now.getTime() - Number(days) * 24 * 60 * 60 * 1000,
			);

			fetch(
				`${endpoint}/channels/${channel_id}/messages?before=${id}&limit=100`,
				{
					method: "GET",
					headers: {
						Authorization: `Bot ${process.env.DISCORD_TOKEN}`,
						"Content-Type": "application/json",
					},
				},
			)
				.then((res) => res.json())
				.then((data) => {
					const messages: Array<Message> =
						data
							?.filter(
								({
									timestamp,
									author,
								}: { timestamp: string; author: { bot?: boolean } }) => {
									const messageDate = new Date(timestamp);
									return messageDate >= nDaysAgo && !author.bot;
								},
							)
							?.map(
								({
									content,
									mentions,
									author,
									mention_everyone,
								}: {
									content: string;
									mentions: Array<User>;
									author: User;
									mention_everyone: boolean;
								}) => {
									return {
										content,
										mentions: mentions.map((mention) => ({
											id: mention.id,
											username: mention.username,
										})),
										author: { id: author.id, username: author.username },
										mention_everyone,
									};
								},
							)
							?.reverse() || [];

					const users = new Map<string, string>();
					for (const message of messages) {
						if (!users.has(message.author.id)) {
							users.set(message.author.id, message.author.username);
						}
						for (const mention of message.mentions) {
							if (!users.has(mention.id)) {
								users.set(mention.id, mention.username);
							}
						}
					}

					let usersListText = "";
					for (const [id, username] of users) {
						usersListText += `- <@${id}> (${username})\n`;
					}
					usersListText = usersListText.trim();

					const chatHistoryText = messages
						.map(({ content, author, mentions, mention_everyone }) => {
							let messageLine = `<@${author.id}> (${author.username}): ${content}`;
							if (mention_everyone) {
								messageLine += " (全員メンション)";
							}
							if (mentions.length > 0) {
								messageLine += ` (メンション: ${mentions.map((mention) => `<@${mention.id}> (${mention.username})`).join(", ")})`;
							}
							return messageLine;
						})
						.join("\n");

					const prompt = `
以下のチャット会話履歴を要約してください。
要約はリスト形式ではなく、文脈や話題ごとにセクション分けし、1000文字以内のわかりやすい文章でまとめてください。各セクションには適切な見出し（Markdownの##や###など）を付けてください。
要約内で特定のユーザーに言及する必要がある場合は、必ずDiscordのメンション形式\`<@ユーザーID>\`を使用してください。
登場人物のリストや会話履歴中の\`<@ユーザーID>\`、各発言の末尾にある\`<@ユーザーID> (ユーザー名)\`を参考に、該当するユーザーのIDを使ってメンションを生成してください。
要約の最後には「タスクの進行状況」というセクションを設け、言及されているタスクがあれば「完了したタスク」と「未完了のタスク」のセクションに分けてそれぞれリストアップしてください。
各タスクの担当者が明確な場合は、Discordのメンション形式\`<@ユーザーID>\`に続けてどのようなタスクかを具体的に書いてください。
最後に文章にユーザ名が含まれている場合はこれを削除し、Discordのメンション形式\`<@ユーザーID>\`のみを残してください。

## 登場人物 (ユーザーIDとユーザー名)
${usersListText.length > 0 ? usersListText : "(登場人物情報なし)"}

## 会話履歴
${chatHistoryText}

## 要約
`;

					return prompt;
				})
				.then((prompt) => {
					return ai.models.generateContent({
						model: "gemini-2.0-flash",
						contents: prompt,
					});
				})
				.then((response) => {
					return fetch(
						`${endpoint}/webhooks/${appId}/${token}/messages/@original`,
						{
							method: "PATCH",
							headers: {
								Authorization: `Bot ${discordToken}`,
								"Content-Type": "application/json",
							},
							body: JSON.stringify({
								embeds: [
									{
										title: `このチャンネルの過去${days}日間のまとめ`,
										description: response.text,
										color: 0x00bfff,
									},
								],
							}),
						},
					);
				})
				.catch((error) => console.error(error));
		}
	}
});

app.listen(3000, () => {
	console.log("Server is running on port 3000");
});
