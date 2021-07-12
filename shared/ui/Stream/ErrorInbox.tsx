import React from "react";
import { Content } from "../src/components/Carousel";
import styled from "styled-components";
import { PanelHeader } from "../src/components/PanelHeader";
import { closePanel } from "./actions";
import { useDispatch, useSelector } from "react-redux";
import { Dialog } from "../src/components/Dialog";
import { CodeStreamState } from "../store";

const Root = styled.div`
	color: var(--text-color);
	position: relative;
	h2,
	h3 {
		color: var(--text-color-highlight);
	}

	h3 {
		margin: 30px 0 5px 0;
		.icon {
			margin-right: 5px;
			vertical-align: -2px;
		}
	}
`;

export const ErrorInboxPanel = () => {
	const dispatch = useDispatch();

	const derivedState = useSelector((state: CodeStreamState) => {

		// from the queryString this is a stringified array of strings
		return {
			stack: state.context.errorInboxOptions?.stack
				? JSON.parse(state.context.errorInboxOptions?.stack)
				: []
		};
	});

	return (
		<Dialog maximizable wide noPadding onClose={() => dispatch(closePanel())}>
			<PanelHeader title="Error Inbox">
				<div style={{ height: "5px" }} />
			</PanelHeader>
			<div style={{ padding: "20px" }}>
				<Content>
					<ErrorInbox stack={derivedState.stack} />
				</Content>
			</div>
		</Dialog>
	);
};

export const ErrorInbox = (props: { stack?: string[] }) => {
	const rootRef = React.useRef(null);

	return (
		<Root ref={rootRef}>
			{props.stack && (
				<div
					dangerouslySetInnerHTML={{
						__html: props.stack.map(_ => `<div style="float:right;">${_}</div>`).join("")
					}}
				></div>
			)}
		</Root>
	);
};
