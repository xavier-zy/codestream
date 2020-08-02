import { PropsWithChildren } from "react";
import React from "react";
import styled from "styled-components";
import { CSText } from "./CSText";
import Icon from "@codestream/webview/Stream/Icon";

const Box = styled.div<{ narrow?: boolean }>`
	background: var(--base-background-color);
	border: 1px solid var(--base-border-color);
	box-shadow: 0 5px 10px rgba(0, 0, 0, 0.2);
	.vscode-dark & {
		box-shadow: 0 5px 10px rgba(0, 0, 0, 0.5);
	}
	padding: 20px 20px 20px 20px;
	position: relative;
	margin: 0 auto;
	display: inline-block;
	text-align: left;
	.standard-form {
		padding: 0;
		.form-body {
			padding: 0;
		}
	}
	max-width: ${props => (props.narrow ? "420px" : "none")};
`;

const Container = styled.div`
	text-align: center;
`;

const Title = styled.div`
	h2 {
		margin: 0 0 10px 0;
	}
`;

const Close = styled.span`
	position: absolute;
	top: 5px;
	right: 5px;
	padding: 5px;
	margin: 0;
	display: inline-block;
`;

interface Props {
	title?: string;
	className?: string;
	narrow?: boolean;
	onClose?(event: React.SyntheticEvent): any;
}

export function Dialog(props: PropsWithChildren<Props>) {
	return (
		<Container>
			<Box className={props.className} narrow={props.narrow}>
				{props.title && (
					<Title>
						<CSText as="h2">{props.title}</CSText>
					</Title>
				)}
				{props.onClose && (
					<Close className="close">
						<Icon className="clickable" name="x" onClick={props.onClose} />
					</Close>
				)}
				{props.children}
			</Box>
		</Container>
	);
}
