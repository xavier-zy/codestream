import React from "react";
import Icon from "./Icon";
import createClassString from "classnames";

Button.defaultProps = {
	className: "",
	disabled: false,
	loading: false,
	isSecondary: false
};

export default function Button({
	children = undefined,
	className,
	disabled = false,
	loading = false,
	isSecondary = false,
	...extras
}) {
	const { dispatch, ...extraProps } = extras; // remove non-html attributes
	return (
		<button
			className={createClassString("btn inline-block-tight", className, {
				"btn-primary": !isSecondary,
				"btn-secondary": isSecondary,
				disabled: disabled
			})}
			disabled={loading || disabled}
			{...extraProps}
		>
			{loading ? <Icon name="sync" className="spin" /> : children}
		</button>
	);
}
