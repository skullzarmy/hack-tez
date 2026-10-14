import type React from "react";

export interface TezCityIconProps extends React.SVGProps<SVGSVGElement> {
	size?: number | string;
	color?: string;
	title?: string;
}

export function TezCityIcon({
	size = 14,
	color = "currentColor",
	title = "TezCity",
	className,
	style,
	...props
}: TezCityIconProps) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 512 512"
			width={size}
			height={size}
			fill={color}
			role="img"
			aria-label={title}
			className={className}
			style={style}
			{...props}
		>
			<title>{title}</title>
			<path d="M106 99H250V127H193V248H163V127H106Z" />
			<path d="M266 99H407V122L310 221H407V248H266V225L362 127H266Z" />
			<path d="M106 275H247V303H135V393H250V421H106Z" />
			<path d="M266 275H407V303H354V421H324V303H266Z" />
		</svg>
	);
}
