import "dotenv/config";

const endpoint = "https://discord.com/api/v10";

export async function createCommand() {
	const appId = process.env.APP_ID;
	const discordToken = process.env.DISCORD_TOKEN;

	if (!appId || !discordToken) {
		console.error(
			"APP_ID and DISCORD_TOKEN must be set in environment variables.",
		);
		process.exit(1);
	}

	const commandBody = {
		name: "summarize",
		description:
			"Summarize the conversation from the past specified number of days",
		type: 1,
		options: [
			{
				name: "days",
				description: "Number of days to summarize",
				type: 4,
				required: true,
			},
		],
	};

	const res = await fetch(`${endpoint}/applications/${appId}/commands`, {
		method: "POST",
		headers: {
			Authorization: `Bot ${discordToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(commandBody),
	});

	if (!res.ok) {
		const data = await res.json();
		console.error(JSON.stringify(data));
		process.exit(1);
	}
}

createCommand();
