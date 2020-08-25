import React, { PropsWithChildren } from "react";
import styled from "styled-components";
import Icon from "@codestream/webview/Stream/Icon";

type ButtonSize = "default" | "large" | "compact";

const getFontSize = (size?: ButtonSize, variant?: ButtonVariant) => {
	if (variant == "text") return "font-size: inherit !important";
	switch (size) {
		case "large":
			return "font-size: 1.15em !important;";
		case "compact":
			return "font-size: 12px !important;";
		case "default":
		default:
			return "font-size: var(--font-size) !important;";
	}
};

const getPadding = (size?: ButtonSize, variant?: ButtonVariant) => {
	if (variant == "text") return "padding: 0;";
	switch (size) {
		case "large":
			return "padding: 1px 15px;";
		case "compact":
			return "padding: 1px 5px;";
		case "default":
		default:
			return "padding: 1px 10px;";
	}
};

const getLineHeight = (size?: ButtonSize, variant?: ButtonVariant) => {
	if (variant == "text") return "line-height: inherit;";
	switch (size) {
		case "large":
			return "line-height: 2em;";
		case "compact":
			return "line-height: 1.6em;";
		case "default":
		default:
			return "line-height: 2em;";
	}
};

const getColors = (variant = "primary") => {
	switch (variant) {
		case "text": {
			return `
			background-color: inherit;
			color: var(--text-color);
				:hover {
					color: var(--text-color-highlight);
				}
			`;
		}
		case "secondary": {
			return `
				background-color: rgba(127, 127, 127, 0.1);
				color: var(--text-color);
				:hover {
					background-color: rgba(127, 127, 127, 0.15);
					color: var(--text-color-highlight);
				}
			`;
		}
		case "destructive": {
			return `
				background-color: #c00;
				color: white;
				:hover {
					opacity: 0.85;
				}
			`;
		}
		case "success": {
			return `
			background-color: #17ca65;
			background-color: #24A100;
			color: white;
				:hover {
					opacity: 0.85;
				}
			`;
		}
		case "warning": {
			return `
				background-color: #ffaa2c;
				color: white;
				:hover {
					opacity: 0.85;
				}
			`;
		}
		case "merged": {
			return `
				background-color: #6f42c1;
				// background-color: #b87cda;
				color: white;
				:hover {
					opacity: 0.85;
				}
			`;
		}
		case "primary":
		default: {
			return `
				background-color: var(--button-background-color);
				color: var(--button-foreground-color);
				:hover {
					background-color: var(--button-background-color-hover);
				}
			`;
		}
	}
};

export const ButtonRoot = styled.button<ButtonProps>(props => {
	return `
	width: ${props.fillParent ? "100%" : "max-content"};
	${getColors(props.variant)}
	cursor: ${props.isLoading || props.disabled ? "default" : "pointer"};
	display: inline-flex;
	align-items: center;
	justify-content: center ${props.isLoading ? "!important" : ""};
	line-height: ${props.variant == "text" ? "2em" : "inherit"};
	user-select: none;
	-webkit-user-select: none;
	z-index: 0;
	text-shadow: none;
	opacity: ${props.disabled ? 0.5 : 1};

	${getFontSize(props.size, props.variant)}
	${getPadding(props.size, props.variant)}
	${getLineHeight(props.size, props.variant)}
	border-radius: 0;
	border: 1px solid transparent !important;
	outline: none !important;

	&.no-wrap {
		white-space: nowrap;
	}
`;
});

const ButtonPrepend = styled.div`
	margin-right: 10px;
	.octicon {
		vertical-align: text-bottom;
	}
`;

const ButtonAppend = styled.div`
	justify-self: end;
	justify-content: flex-end;
	flex: 2;
	display: flex;
	margin-left: 10px;
`;

type ButtonVariant =
	| "primary"
	| "secondary"
	| "destructive"
	| "success"
	| "warning"
	| "text"
	| "merged";

export interface ButtonProps extends PropsWithChildren<{}> {
	variant?: ButtonVariant;
	disabled?: boolean;
	isLoading?: boolean;
	size?: ButtonSize;
	prependIcon?: React.ReactNode;
	appendIcon?: React.ReactNode;
	onClick?: React.MouseEventHandler;
	fillParent?: boolean;
	className?: string;
	tabIndex?: number;
}

export function getButtonProps<P extends ButtonProps>(props: P): ButtonProps {
	return {
		variant: props.variant,
		disabled: props.disabled,
		isLoading: props.isLoading,
		size: props.size,
		prependIcon: props.prependIcon,
		appendIcon: props.appendIcon,
		onClick: props.onClick,
		fillParent: props.fillParent
	};
}

export const Button = React.forwardRef((props: ButtonProps, ref?: React.Ref<any>) => {
	const { children, onClick, ...rest } = props;

	const internals = (
		<>
			{props.prependIcon && <ButtonPrepend>{props.prependIcon}</ButtonPrepend>}
			<span style={{ textOverflow: "ellipsis", overflow: "hidden" }}>{props.children}</span>
			{props.appendIcon && <ButtonAppend>{props.appendIcon}</ButtonAppend>}
		</>
	);

	return (
		<ButtonRoot
			{...rest}
			onClick={props.isLoading || props.disabled ? undefined : onClick}
			className={props.className}
			ref={ref}
		>
			{props.isLoading ? (
				<>
					<div style={{ opacity: 0, display: "flex" }}>{internals}</div>
					<div style={{ position: "absolute" }}>
						<Icon name="sync" className="spin" />
					</div>
				</>
			) : (
				internals
			)}
		</ButtonRoot>
	);
});
