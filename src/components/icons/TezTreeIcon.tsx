import type React from "react";

export interface TezTreeIconProps extends React.SVGProps<SVGSVGElement> {
	size?: number | string;
	color?: string;
	title?: string;
}

export function TezTreeIcon({
	size = 14,
	color = "currentColor",
	title = "Teztree",
	className,
	style,
	...props
}: TezTreeIconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 64 64"
			width={size}
			height={size}
			role="img"
			aria-label={title}
			className={className}
			style={style}
			{...props}
		>
			<title>{title}</title>
			<g
				transform="translate(32 32) scale(1.6) translate(-10.3 -13.7)"
				fill="none"
				stroke={color}
				strokeWidth="3.6"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M9.2 2v12.2" />
				<path d="M3 7.6h12.6" />
				<path d="M9.2 14.4c7 0 8.6 4.4 2 5.4 6.8 1 5.4 7-2 5.6" />
			</g>
		</svg>
	);
}
