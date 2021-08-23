import React from "react";
import { Content } from "../src/components/Carousel";
import styled from "styled-components";
import { PanelHeader } from "../src/components/PanelHeader";
import { closePanel } from "./actions";
import { useDispatch, useSelector } from "react-redux";
import { Dialog } from "../src/components/Dialog";
import { CodeStreamState } from "../store";
import MessageInput from "./MessageInput";
import CancelButton from "./CancelButton";
import Button from "./Button";

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

export const InstrumentationPanel = () => {
	const dispatch = useDispatch();

	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			currentinstrumentation: state.context.currentInstrumentation
		};
	});

	return (
		<Dialog maximizable wide noPadding onClose={() => dispatch(closePanel())}>
			<PanelHeader title={derivedState.currentinstrumentation?.name}>
				<div style={{ height: "5px" }} />
			</PanelHeader>
			<div style={{ padding: "20px" }}>
				<Content>
					<Instrumentation />
				</Content>
			</div>
		</Dialog>
	);
};

export const Instrumentation = (props: { stack?: string[]; customAttributes?: any }) => {
	const rootRef = React.useRef(null);

	return (
		<Root ref={rootRef}>
			<br />
			<br />
			<MessageInput multiCompose text="" placeholder="Add Comment..." onChange={text => {}} />
			<div
				key="buttons"
				className="button-group"
				style={{
					marginLeft: "10px",
					marginTop: "10px",
					float: "right",
					width: "auto",
					marginRight: 0
				}}
			>
				<CancelButton onClick={e => {}} mode="button" />
				<Button
					key="submit"
					style={{
						paddingLeft: "10px",
						paddingRight: "10px",
						// fixed width to handle the isLoading case
						width: "80px",
						marginRight: 0
					}}
					className={""}
					type="submit"
					onClick={e => {}}
				>
					{"Submit"}
				</Button>
			</div>
			<br />
		</Root>
	);
};
