import { PixieGetNamespacesRequestType } from "@codestream/protocols/agent";
import { DropdownButton, DropdownButtonItems } from "@codestream/webview/Stream/DropdownButton";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import { HostApi } from "@codestream/webview/webview-api";
import React, { useEffect } from "react";

export const Namespaces = props => {
	const [isLoading, setIsLoading] = React.useState(false);
	const [namespaces, setNamespaces] = React.useState<DropdownButtonItems[]>([]);
	let error: string | undefined;

	useEffect(() => {
		void loadNamespaces();
	}, [props.account.id, props.cluster.clusterId]);

	const loadNamespaces = async () => {
		setIsLoading(true);
		try {
			debugger;
			const response = await HostApi.instance.send(PixieGetNamespacesRequestType, {
				accountId: props.account.id,
				clusterId: props.cluster.clusterId
			});
			setNamespaces(
				response.namespaces.map(_ => ({
					key: _,
					label: _,
					action: () => {
						props.onSelect(_);
					}
				}))
			);
			error = undefined;
			props.onSelect(response.namespaces[0]);
		} catch (err) {
			props.onSelect(undefined);
			error = err.toString();
			setNamespaces([]);
		}
		setIsLoading(false);
	};

	return (
		error
			?
				<small className="explainer error-message">
					{error}
				</small>
			:
				<DropdownButton items={namespaces} isLoading={isLoading} size="compact" wrap>
					{props.value || "Namespace"}
				</DropdownButton>
	);
};
