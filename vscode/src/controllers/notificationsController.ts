"use strict";
import { PullRequestsChangedEvent } from "api/sessionEvents";
import { Disposable, MessageItem, window } from "vscode";
import { Post, PostsChangedEvent } from "../api/session";
import { Container } from "../container";
import { CodemarkPlus, ReviewPlus } from "../protocols/agent/agent.protocol";
import { vslsUrlRegex } from "./liveShareController";

export class NotificationsController implements Disposable {
	private _disposable: Disposable;

	constructor() {
		this._disposable = Disposable.from(
			Container.session.onDidChangePosts(this.onSessionPostsReceived, this),
			Container.session.onDidChangePullRequests(this.onSessionPullRequestsReceived, this)
		);
	}

	dispose() {
		this._disposable && this._disposable.dispose();
	}

	private async onSessionPullRequestsReceived(e: PullRequestsChangedEvent) {
		const { user } = Container.session;

		if (!user.wantsToastNotifications()) return;

		for (const pullRequestNotification of e.pullRequestNotifications()) {
			const actions: MessageItem[] = [{ title: "Open" }];

			const result = await window.showInformationMessage(
				`Pull Request "${pullRequestNotification.pullRequest.title}" ${pullRequestNotification.queryName}`,
				...actions
			);

			if (result === actions[0]) {
				Container.webview.openPullRequest(
					pullRequestNotification.pullRequest.providerId,
					pullRequestNotification.pullRequest.id
				);
			}

			return;
		}
	}

	private async onSessionPostsReceived(e: PostsChangedEvent) {
		const { user } = Container.session;
		const { activeStreamThread: activeStream, visible: streamVisible } = Container.webview;

		if (!user.wantsToastNotifications()) return;

		for (const post of e.items()) {
			// Don't show notifications for deleted, edited (if edited it isn't the first time its been seen), has replies (same as edited), has reactions, or was posted by the current user
			if (!post.isNew() || post.senderId === user.id) {
				continue;
			}
			let codemark;
			let review;
			const parentPost = await post.parentPost();
			if (parentPost) {
				codemark = parentPost.codemark;
				review = parentPost.review;
				if (!codemark && !review) {
					const grandparentPost = await parentPost.parentPost();
					if (grandparentPost) {
						review = grandparentPost.review;
					}
				}
			} else {
				codemark = post.codemark;
				review = post.review;
			}

			const mentioned = post.mentioned(user.id);
			// If we are muted and not mentioned, skip it
			if (user.hasMutedChannel(post.streamId) && !mentioned) continue;

			const isPostStreamVisible =
				streamVisible && !(activeStream === undefined || activeStream.streamId !== post.streamId);

			const followerIds = codemark ? codemark.followerIds : review!.followerIds;
			const isUserFollowing = (followerIds || []).includes(user.id);
			if (isUserFollowing && (!isPostStreamVisible || mentioned)) {
				this.showNotification(post, codemark, review, mentioned);
			}
		}
	}

	async showNotification(
		post: Post,
		codemark?: CodemarkPlus,
		review?: ReviewPlus,
		mentioned?: boolean
	) {
		const sender = await post.sender();

		const emote = post.text.startsWith("/me ");
		const colon = emote ? "" : ":";
		const text = post.text.replace(/^\/me /, "");
		if (mentioned && sender !== undefined) {
			const match = vslsUrlRegex.exec(text);
			if (match != null) {
				const actions: MessageItem[] = [
					{ title: "Join Live Share" },
					{ title: "Ignore", isCloseAffordance: true }
				];

				const result = await window.showInformationMessage(
					`${sender.name} is inviting you to join a Live Share session`,
					...actions
				);

				if (result === actions[0]) {
					Container.vsls.join({ url: match[0] });
				}

				return;
			}
		}

		// TODO: Need to better deal with formatted text for notifications
		const actions: MessageItem[] = [{ title: "Open" }];

		const result = await window.showInformationMessage(
			`${sender !== undefined ? sender.name : "Someone"}${colon} ${text}`,
			...actions
		);
		if (result === actions[0]) {
			if (codemark) {
				Container.webview.openCodemark(codemark.id);
			} else if (review) {
				Container.webview.openReview(review.id);
			}
		}
	}
}
