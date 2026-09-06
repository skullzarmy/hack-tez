import type { ReactNode } from "react";

export interface CommandContext {
	close: () => void;
}

export interface CommandResult {
	output?: ReactNode;
	clear?: boolean;
}

type Handler = (context: CommandContext) => CommandResult;

export interface CommandDef {
	aliases: string[];
	description: string;
	category: "Basic Commands" | "Tezos Commands" | "Secrets";
	/** Secrets exist to be stumbled on, not advertised. Hidden from `help`. */
	hidden?: boolean;
	run: Handler;
}

function line(text: string): ReactNode {
	return <div>{text}</div>;
}

function gmResponse(): string {
	const hour = new Date().getHours();
	if (hour === 3) return "it's 3am and you're in a fake terminal. gm anyway.";
	if (hour >= 22 || hour < 5) return "gn frens";
	return "gm frens";
}

export const commands: CommandDef[] = [
	{
		aliases: ["help"],
		description: "Show this list",
		category: "Basic Commands",
		run: () => ({ output: null }), // handled specially by DevConsole to render the live table
	},
	{
		aliases: ["clear"],
		description: "Clear the console",
		category: "Basic Commands",
		run: () => ({ clear: true }),
	},
	{
		aliases: ["close", "exit"],
		description: "Close the console",
		category: "Basic Commands",
		run: (ctx) => {
			ctx.close();
			return {};
		},
	},
	{
		aliases: ["gm", "gn"],
		description: "Say hi",
		category: "Tezos Commands",
		run: () => ({ output: line(gmResponse()) }),
	},
	{
		aliases: ["xtz", "price"],
		description: "XTZ price ticker",
		category: "Tezos Commands",
		run: () => ({
			output: (
				<pre className="dev-console-pre">{`XTZ/USD
1h    1d    1w    1y    ever
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
1 XTZ = 1 XTZ

fuck the price.`}</pre>
			),
		}),
	},
	{
		aliases: ["michelson"],
		description: "Print some Michelson",
		category: "Tezos Commands",
		run: () => ({
			output: <pre className="dev-console-pre">{`{ CDR ;\n  NIL operation ;\n  PAIR }`}</pre>,
		}),
	},
	{
		aliases: ["bake"],
		description: "Bake a block",
		category: "Tezos Commands",
		run: () => ({
			output: (
				<pre className="dev-console-pre">{`Baking block #.......... 🥖
...you need a delegate and 6,000 ꜩ minimum.
Byte-sized dreams stay byte-sized.`}</pre>
			),
		}),
	},
	{
		aliases: ["gas"],
		description: "Check gas fees",
		category: "Tezos Commands",
		run: () => ({ output: line("Gas fee: 0.0004ꜩ. Basically a rounding error. You're welcome.") }),
	},
	{
		aliases: ["hen"],
		description: "hic et nunc",
		category: "Tezos Commands",
		run: () => ({
			output: (
				<pre className="dev-console-pre">{`hic et nunc (lat.) "here and now."
Also: the marketplace that vanished one Tuesday in 2021 and took a slice of Tezos NFT history with it. o7`}</pre>
			),
		}),
	},
	{
		aliases: ["teia"],
		description: "teia.art",
		category: "Tezos Commands",
		run: () => ({ output: line("The fork that showed up after HEN died and just kept going. Nobody's in charge and it still works.") }),
	},
	{
		aliases: ["objkt"],
		description: "objkt.com",
		category: "Tezos Commands",
		run: () => ({ output: line("The one that ended up eating the market. No hard feelings, it just happened.") }),
	},
	{
		aliases: ["strongertogether"],
		description: "#StrongerTogether",
		category: "Tezos Commands",
		run: () => ({
			output: (
				<div>
					#StrongerTogether. TheTezosCommunity: a community-organized Tezos town hall, operated by
					volunteers.{" "}
					<a href="https://thetezos.com" target="_blank" rel="noopener noreferrer" className="dev-console-link">
						thetezos.com
					</a>
				</div>
			),
		}),
	},
	{
		aliases: ["rm -rf /"],
		description: "Easter egg command",
		category: "Secrets",
		hidden: true,
		run: () => ({ output: line('FAILWITH: "nice try"') }),
	},
	{
		aliases: ["sudo"],
		description: "Easter egg command",
		category: "Secrets",
		hidden: true,
		run: () => ({ output: line("sudo: command not found. This isn't Ubuntu. Try 'bake' instead.") }),
	},
	{
		aliases: ["fafo"],
		description: "Easter egg command",
		category: "Secrets",
		hidden: true,
		run: () => ({
			output: (
				<div>
					fuck around and find out. (a more literal version of this lives at{" "}
					<a href="https://fafolab.xyz" target="_blank" rel="noopener noreferrer" className="dev-console-link">
						fafolab.xyz
					</a>
					)
				</div>
			),
		}),
	},
	{
		aliases: ["reggie"],
		description: "Easter egg command",
		category: "Secrets",
		hidden: true,
		run: () => ({
			output: (
				<div>
					Reggie doesn't work here. Try{" "}
					<a href="https://fafolab.xyz" target="_blank" rel="noopener noreferrer" className="dev-console-link">
						fafolab.xyz
					</a>
					.
				</div>
			),
		}),
	},
	{
		aliases: ["wtf"],
		description: "Easter egg command",
		category: "Secrets",
		hidden: true,
		run: () => ({
			output: (
				<div>
					oh you must be looking for{" "}
					<a href="https://wtfos.app/" target="_blank" rel="noopener noreferrer" className="dev-console-link">
						wtfos.app
					</a>
				</div>
			),
		}),
	},
];

export function findCommand(input: string): CommandDef | undefined {
	const normalized = input.trim().toLowerCase();
	return commands.find((def) => def.aliases.includes(normalized));
}
