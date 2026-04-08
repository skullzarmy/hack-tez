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
>(function DropdownMenuContent({ className, sideOffset = 8, ...props }, ref) {
    return (
        <DropdownMenuPortal>
            <DropdownMenuPrimitive.Content
                ref={ref}
                sideOffset={sideOffset}
                className={joinClasses("radix-dropdown-content", className)}
                style={{
                    minWidth: "260px",
                    background: "var(--bg-2, #0a0a0a)",
                    border: "1px solid var(--border-2, #333)",
                    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
                    padding: "0.5rem",
                    zIndex: 1000,
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

export {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuSeparator,
};