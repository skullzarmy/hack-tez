import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

const Switch = React.forwardRef<
    React.ElementRef<typeof SwitchPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ ...props }, ref) {
    const checked = Boolean(props.checked);

    return (
        <SwitchPrimitive.Root
            ref={ref}
            style={{
                width: "36px",
                height: "20px",
                border: "1px solid var(--border-2, #333)",
                background: checked ? "var(--accent)" : "var(--bg-3, #1a1a1a)",
                display: "inline-flex",
                alignItems: "center",
                cursor: "pointer",
                padding: 0,
                outline: "none",
                transition: "background 140ms ease",
            }}
            {...props}
        >
            <SwitchPrimitive.Thumb
                style={{
                    display: "block",
                    width: "16px",
                    height: "16px",
                    background: checked ? "var(--bg, #000)" : "var(--fg-2, rgba(255,255,255,0.75))",
                    transform: checked ? "translateX(18px)" : "translateX(2px)",
                    transition: "transform 140ms ease",
                }}
            />
        </SwitchPrimitive.Root>
    );
});

export { Switch };
