import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import type { AnimatedIconHandle } from "./users";

interface MessageCircleIconProps extends HTMLAttributes<HTMLDivElement> {
    size?: number;
}

const ICON_VARIANTS: Variants = {
    normal: { scale: 1, rotate: 0 },
    animate: {
        scale: 1.05,
        rotate: [0, -7, 7, 0],
        transition: {
            rotate: { duration: 0.5, ease: "easeInOut" },
            scale: { type: "spring", stiffness: 400, damping: 10 },
        },
    },
};

const MessageCircleIcon = forwardRef<AnimatedIconHandle, MessageCircleIconProps>(
    ({ onMouseEnter, onMouseLeave, className, size = 18, ...props }, ref) => {
        const controls = useAnimation();
        const isControlledRef = useRef(false);

        useImperativeHandle(ref, () => {
            isControlledRef.current = true;
            return {
                startAnimation: () => controls.start("animate"),
                stopAnimation: () => controls.start("normal"),
            };
        });

        const handleMouseEnter = useCallback(
            (e: React.MouseEvent<HTMLDivElement>) => {
                if (isControlledRef.current) onMouseEnter?.(e);
                else controls.start("animate");
            },
            [controls, onMouseEnter],
        );

        const handleMouseLeave = useCallback(
            (e: React.MouseEvent<HTMLDivElement>) => {
                if (isControlledRef.current) onMouseLeave?.(e);
                else controls.start("normal");
            },
            [controls, onMouseLeave],
        );

        return (
            // biome-ignore lint/a11y/noStaticElementInteractions: the wrapper exists only to drive a decorative hover animation on an aria-hidden svg; the real control is whatever button or link renders this icon
            <div
                className={className}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                {...props}
            >
                <motion.svg
                    aria-hidden="true"
                    animate={controls}
                    fill="none"
                    height={size}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    variants={ICON_VARIANTS}
                    viewBox="0 0 24 24"
                    width={size}
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
                </motion.svg>
            </div>
        );
    },
);

MessageCircleIcon.displayName = "MessageCircleIcon";

export { MessageCircleIcon };
