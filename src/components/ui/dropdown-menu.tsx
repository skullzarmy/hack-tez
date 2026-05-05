import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";

function joinClasses(...values: Array<string | undefined>): string {
    return values.filter(Boolean).join(" ");
}

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

const DropdownMenuContent = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 8, style, ...props }, ref) {
    return (
        <DropdownMenuPortal>
            <DropdownMenuPrimitive.Content
                ref={ref}
                sideOffset={sideOffset}
                className={joinClasses("radix-dropdown-content", className)}
                style={{
                    minWidth: "260px",
                    maxWidth: "calc(100vw - 16px)",
                    background: "var(--bg-2, #0a0a0a)",
                    border: "1px solid var(--border-2, #333)",
                    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
                    padding: "0.5rem",
                    zIndex: 1000,
                    ...style,
                }}
                {...props}
            />
        </DropdownMenuPortal>
    );
});

const DropdownMenuSeparator = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
    return (
        <DropdownMenuPrimitive.Separator
            ref={ref}
            className={joinClasses("radix-dropdown-separator", className)}
            style={{
                height: "1px",
                background: "var(--border-2, #333)",
                margin: "0.4rem 0",
            }}
            {...props}
        />
    );
});

const DropdownMenuItem = React.forwardRef<
    React.ElementRef<typeof DropdownMenuPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(function DropdownMenuItem({ className, style, ...props }, ref) {
    return (
        <DropdownMenuPrimitive.Item
            ref={ref}
            className={joinClasses("radix-dropdown-item", className)}
            style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.6rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                color: "var(--fg-1, #eaeaea)",
                cursor: "pointer",
                outline: "none",
                userSelect: "none",
                ...style,
            }}
            {...props}
        />
    );
});

export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuSeparator,
    DropdownMenuItem,
};
