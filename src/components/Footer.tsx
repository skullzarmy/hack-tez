import { SiBluesky } from "@icons-pack/react-simple-icons";

export default function Footer({ compact }: { compact?: boolean }) {
	return (
		<footer
			className="footer"
			style={compact ? { marginTop: 0, paddingBlock: "0.75rem" } : undefined}
		>
			<div className="container footer-inner">
				<span className="footer-copy">
					<span>
						&lt;&lt; a{" "}
						<a
							href="https://fafolab.xyz"
							target="_blank"
							rel="noopener noreferrer"
							className="footer-link footer-fafolab"
							aria-label="FAFOlab (opens in new tab)"
						>
							FAFO<del>lab</del>
						</a>{" "}
						joint &gt;&gt;
					</span>
					<a
						href="https://bsky.app/profile/hacktez.com"
						target="_blank"
						rel="noopener noreferrer"
						className="footer-link"
						aria-label="hack.tez on Bluesky (opens in new tab)"
						style={{ display: "inline-flex", alignItems: "center", gap: "0.35em", marginLeft: "0.5em" }}
					>
						<SiBluesky size={11} aria-hidden="true" /> @hacktez.com
					</a>
				</span>
				<span className="footer-oss">
					hack.tez is open source and{" "}
					<a
						href="https://unlicense.org"
						target="_blank"
						rel="noopener noreferrer"
						className="footer-link"
						aria-label="Unlicense — public domain (opens in new tab)"
					>
						unlicensed
					</a>{" "}
					— public domain. copy it. use it.{" "}
					<a
						href="https://github.com/skullzarmy/hack-tez/"
						target="_blank"
						rel="noopener noreferrer"
						className="footer-link"
						aria-label="hack.tez on GitHub (opens in new tab)"
					>
						github.com/skullzarmy/hack-tez
					</a>
				</span>
			</div>
		</footer>
	);
}
