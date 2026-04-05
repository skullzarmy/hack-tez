export default function Footer({ compact }: { compact?: boolean }) {
    return (
        <footer className="footer" style={compact ? { marginTop: 0, paddingBlock: "0.75rem" } : undefined}>
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
                </span>
            </div>
        </footer>
    );
}
