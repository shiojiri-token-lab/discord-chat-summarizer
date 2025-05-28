import "dotenv/config";

const endpoint = "https://discord.com/api/v10";

export async function deleteCommand() {
	const appId = process.env.APP_ID;
	const discordToken = process.env.DISCORD_TOKEN;

	if (!appId || !discordToken) {
		console.error(
			"APP_ID and DISCORD_TOKEN must be set in environment variables.",
		);
		process.exit(1);
	}

	const getRes = await fetch(`${endpoint}/applications/${appId}/commands`, {
		method: "GET",
		headers: { Authorization: `Bot ${discordToken}` },
	});

	if (!getRes.ok) {
		const data = await getRes.json();
		console.error(JSON.stringify(data));
		process.exit(1);
	}

	const data = await getRes.json();

	for (const command of data) {
		const commandId = command.id;

		const deleteRes = await fetch(
			`${endpoint}/applications/${appId}/commands/${commandId}`,
			{
				method: "DELETE",
				headers: { Authorization: `Bot ${discordToken}` },
			},
		);

		if (!deleteRes.ok) {
			const data = await deleteRes.json();
			console.error(JSON.stringify(data));
			process.exit(1);
		}
	}
}

deleteCommand();
