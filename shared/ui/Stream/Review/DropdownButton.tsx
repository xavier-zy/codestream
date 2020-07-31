import React from "react";
import { Button, getButtonProps, ButtonProps } from "../../src/components/Button";
import styled from "styled-components";
import Icon from "../Icon";
import Menu from "../Menu";
import { mapFilter } from "@codestream/webview/utils";

// This implementation isn't quite ideal.
// [The <Menu/> should appear below the caret button as if they are connected -this part is done now -Pez]
// The api for consumers could probably be better, but it's only used in the review component for now

export interface DropdownButtonProps extends ButtonProps {
	items: {
		label: any;
		key?: string;
		action?: () => void;
		noHover?: boolean;
		disabled?: boolean;
		submenu?: any[];
		subtext?: any;
		icon?: any;
	}[];
}

export function DropdownButton(props: React.PropsWithChildren<DropdownButtonProps>) {
	const buttonRef = React.useRef<HTMLElement>(null);
	const [menuIsOpen, toggleMenu] = React.useReducer((open: boolean) => !open, false);
	const [selectedItem, setSelectedItem] = React.useState(props.items[0]);

	// TODO: this is not the best way to check for uniqueness
	const items = mapFilter(props.items, i =>
		i.label === selectedItem.label
			? null
			: { key: i, label: i.label, action: () => setSelectedItem(i) }
	);

	const maybeToggleMenu = action => {
		if (action !== "noop") toggleMenu(action);
	};

	return (
		<Root className={props.className}>
			<Button
				{...getButtonProps(props)}
				onClick={e => {
					e.preventDefault();
					e.stopPropagation();
					toggleMenu(true);
				}}
				ref={buttonRef}
			>
				{props.children}
				<Icon name="chevron-down" className="chevron-down" />
			</Button>
			{menuIsOpen && buttonRef.current && (
				<Menu
					align="dropdownRight"
					action={maybeToggleMenu}
					target={buttonRef.current}
					items={props.items}
					focusOnSelect={buttonRef.current}
				/>
			)}
		</Root>
	);
}

const Root = styled.div`
	display: inline;
	.octicon-chevron-down {
		margin-left: 5px;
		transform: scale(0.8);
	}
`;

const StyledButton = styled(Button)`
	border: 1px solid ${props => props.theme.colors.baseBorder} !important;
	background: transparent !important;
	color: var(--text-color) !important;
	&:hover {
		color: var(--button-foreground-color) !important;
		background: var(--button-background-color) !important;
		border: 1px solid var(--button-background-color) !important;
		display: inline-block;
	}
`;
