import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { CodeStreamState } from "../store";
import Icon from "./Icon";
import Menu from "./Menu";
import { emojify } from "./Markdowner";
import styled from "styled-components";
import { PRReactions, PRReaction } from "./PullRequestComponents";
import Tooltip from "./Tooltip";
import { SmartFormattedList } from "./SmartFormattedList";
import { HostApi } from "../webview-api";
import { ExecuteThirdPartyTypedType } from "@codestream/protocols/agent";
import { DropdownButton } from "./Review/DropdownButton";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import copy from "copy-to-clipboard";

interface CommentMenuProps {
	pr: any;
	comment: any;
	setEdit?: Function;
	quote?: Function;
}

export const PullRequestCommentMenu = (props: CommentMenuProps) => {
	const { pr, comment, setEdit, quote } = props;

	const items: any[] = [];

	if (comment.resourcePath) {
		items.push({
			label: "Copy Link",
			key: "copy",
			action: () => copy(pr.baseUrl + comment.resourcePath)
		});
	}
	if (quote) {
		items.push(
			{ label: "Quote Reply", key: "quote", action: () => quote(comment.body) },
			{ label: "-" }
		);
	}
	if (setEdit) {
		items.push({
			label: "Edit",
			key: "edit",
			action: () => {
				if (setEdit) setEdit(comment, true);
			}
		});
	}

	return (
		<InlineMenu noChevronDown items={items}>
			<Icon name="kebab-horizontal" className="clickable" />
		</InlineMenu>
	);
};
