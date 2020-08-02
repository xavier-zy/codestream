import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import Icon from "./Icon";
import Menu from "./Menu";
import { emojify } from "./Markdowner";
import styled from "styled-components";

interface Props {
	target: string;
}

const PRReact = styled.div`
	display: inline-block;
	transition: transform 0.1s;
	cursor: pointer;
	&:hover {
		transform: scale(1.2);
	}
	p {
		margin: 0 7px;
	}
`;

export const PullRequestReactButton = (props: Props) => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		return {};
	});

	const [open, setOpen] = React.useState<EventTarget | undefined>();
	const [menuTitle, setMenuTitle] = React.useState("");

	const makeIcon = (name: string, title: string) => {
		const emoji = emojify(":" + name + ":");
		return (
			<PRReact onMouseEnter={() => setMenuTitle(title)} onMouseLeave={() => setMenuTitle("")}>
				<span dangerouslySetInnerHTML={{ __html: emoji }} />
			</PRReact>
		);
	};
	return (
		<span>
			{open && (
				<Menu
					title={
						<div style={{ fontSize: "13px", fontWeight: "normal" }}>
							{menuTitle || "Pick your reaction"}
						</div>
					}
					align="bottomRight"
					noCloseIcon
					target={open}
					items={[
						{ label: "-" },
						{
							fragment: (
								<div style={{ padding: "10px" }}>
									{makeIcon("+1", "+1")}
									{makeIcon("-1", "-1")}
									{makeIcon("smile", "Laugh")}
									{makeIcon("tada", "Hooray")}
									<div style={{ height: "5px" }} />
									{makeIcon("confused", "Confused")}
									{makeIcon("heart", "Heart")}
									{makeIcon("rocket", "Rocket")}
									{makeIcon("eyes", "Eyes")}
								</div>
							)
						}
					]}
					action={() => setOpen(undefined)}
				/>
			)}
			<Icon
				name="smiley"
				className="clickable"
				onClick={e => setOpen(open ? undefined : e.target)}
			/>
		</span>
	);
};
