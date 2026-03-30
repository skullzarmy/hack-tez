export default function Footer() {
    return (
        <footer className="footer">
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
                        joint
                    </span>
                    <span aria-hidden="true" style={{ color: "var(--fg-3)" }}>
                        &gt;&gt;
                    </span>
                    <a href="/manifesto" className="footer-link">
                        manifesto
                    </a>
                </span>
            </div>
        </footer>
    );
}
