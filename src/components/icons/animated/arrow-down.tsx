import type { Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { HTMLAttributes } from "react";
import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";

import type { AnimatedIconHandle } from "./users";

interface ArrowDownIconProps extends HTMLAttributes<HTMLDivElement> {
    size?: number;
}

const PATH_VARIANTS: Variants = {
    normal: { d: "m19 12-7 7-7-7", translateY: 0 },
    animate: {
        d: "m19 12-7 7-7-7",
        translateY: [0, -3, 0],
        transition: { duration: 0.4 },
    },
};

const SECOND_PATH_VARIANTS: Variants = {
    normal: { d: "M12 5v14" },
    animate: {
        d: ["M12 5v14", "M12 5v9", "M12 5v14"],
        transition: { duration: 0.4 },
    },
};

const ArrowDownIcon = forwardRef<AnimatedIconHandle, ArrowDownIconProps>(
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
                <svg
                    aria-hidden="true"
                    fill="none"
                    height={size}
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width={size}
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <motion.path animate={controls} d="m19 12-7 7-7-7" variants={PATH_VARIANTS} />
                    <motion.path animate={controls} d="M12 5v14" variants={SECOND_PATH_VARIANTS} />
                </svg>
            </div>
        );
    },
);

ArrowDownIcon.displayName = "ArrowDownIcon";

export { ArrowDownIcon };
