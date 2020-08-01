import React from "react";
import { useDispatch, useSelector } from "react-redux";
import { useDidMount } from "../utilities/hooks";
import { CodeStreamState } from "../store";
import { WebviewPanels } from "../ipc/webview.protocol.common";
import Icon from "./Icon";
import { openPanel } from "./actions";
import Menu from "./Menu";
import { isFeatureEnabled } from "../store/apiVersioning/reducer";
import { canCreateCodemark } from "../store/codemarks/actions";
import { HostApi } from "../webview-api";
import { StartWorkNotificationType } from "@codestream/protocols/webview";
import { setCurrentReview } from "../store/context/actions";
import { ComposeKeybindings } from "./ComposeTitles";

interface PlusMenuProps {
	menuTarget: any;
	closeMenu: any;
}

export function PlusMenu(props: PlusMenuProps) {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		return {
			kickstartEnabled: isFeatureEnabled(state, "kickstart"),
			activePanel: state.context.panelStack[0],
			textEditorUri: state.editorContext && state.editorContext.textEditorUri,
			lightningCodeReviewsEnabled: isFeatureEnabled(state, "lightningCodeReviews")
		};
	});

	useDidMount(() => {
		const disposable = HostApi.instance.on(StartWorkNotificationType, () =>
			handleStartWorkRequest()
		);
		return () => disposable && disposable.dispose();
	});

	const handleStartWorkRequest = () => {
		dispatch(setCurrentReview(""));
		if (derivedState.activePanel === WebviewPanels.Status) {
			const div = document.getElementById("start-work-div");
			if (div) {
				div.classList.add("show-instructions");
				div.classList.add("highlight-pulse");
				div.scrollIntoView({ behavior: "smooth" });
				setTimeout(() => {
					div.classList.remove("highlight-pulse");
				}, 1000);
			}
		}
		dispatch(openPanel(WebviewPanels.Status));
	};

	const menuItems = [] as any;
	if (derivedState.kickstartEnabled) {
		menuItems.push(
			{
				icon: <Icon name="ticket" />,
				label: "Start Work",
				action: handleStartWorkRequest,
				shortcut: ComposeKeybindings.work,
				subtextWide: "Grab a ticket & create a branch",

				key: "work"
			},
			{ label: "-" }
		);
	}

	if (canCreateCodemark(derivedState.textEditorUri)) {
		menuItems.push(
			{
				icon: <Icon name="comment" />,
				label: "Add Comment",
				action: () => dispatch(openPanel(WebviewPanels.NewComment)),
				subtextWide: "Comment on code & share to slack",
				shortcut: ComposeKeybindings.comment,
				key: "comment"
			},
			{ label: "-" },
			{
				icon: <Icon name="issue" />,
				label: "Create Issue",
				subtextWide: "Perform ad-hoc code review",
				action: () => dispatch(openPanel(WebviewPanels.NewIssue)),
				shortcut: ComposeKeybindings.issue,
				key: "issue"
			}
		);
	}

	if (derivedState.lightningCodeReviewsEnabled) {
		if (menuItems.length > 0) menuItems.push({ label: "-" });
		menuItems.push({
			icon: <Icon name="review" />,
			label: "Request a Code Review",
			subtextWide: "Get feedback on your WIP",
			action: () => dispatch(openPanel(WebviewPanels.NewReview)),
			shortcut: ComposeKeybindings.review,
			key: "review"
		});
	}

	return (
		<Menu items={menuItems} target={props.menuTarget} action={props.closeMenu} align="popupRight" />
	);
}
