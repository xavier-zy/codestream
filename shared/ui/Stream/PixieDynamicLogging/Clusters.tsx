import { PixieGetClustersRequestType } from "@codestream/protocols/agent";
import { CodeStreamState } from "@codestream/webview/store";
import { DropdownButton, DropdownButtonItems } from "@codestream/webview/Stream/DropdownButton";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import { HostApi } from "@codestream/webview/webview-api";
import React, { useEffect } from "react";
import { shallowEqual, useSelector } from "react-redux";

export const Clusters = props => {
	const [isLoading, setIsLoading] = React.useState(false);
	const [clusters, setClusters] = React.useState<DropdownButtonItems[]>([]);
	const [error, setError] = React.useState<string | undefined>();

	const defaultClusterId = useSelector(
		(state: CodeStreamState) => state.preferences.pixieDefaultClusterId
	);

	useEffect(() => {
		void loadClusters();
	}, [props.account.id]);

	const loadClusters = async () => {
		setIsLoading(true);
		try {
			const response = await HostApi.instance.send(PixieGetClustersRequestType, {
				accountId: props.account.id
			});
			const newClusters = response.clusters.map(_ => ({
				key: _.clusterId,
				label: _.clusterName,
				searchLabel: _.clusterName,
				action: () => {
					props.onSelect(_);
				}
			})) as DropdownButtonItems[];
			if (newClusters.length > 5) {
				newClusters.unshift(
					{
						label: "",
						placeholder: "Search Clusters",
						type: "search"
					},
					{ label: "-" }
				);
			}
			setClusters(newClusters);
			setError(undefined);
			if (defaultClusterId) {
				props.onSelect(response.clusters.find(_ => _.clusterId === defaultClusterId));
			}
			// props.onSelect(response.clusters[0]);
		} catch (err) {
			props.onSelect(undefined);
			setError(err.toString());
			setClusters([]);
		}
		setIsLoading(false);
	};

	return (
		<div style={{ padding: "0px 0px 1px 0px" }}>
			{error ? (
				<small className="explainer error-message">{error}</small>
			) : (
				<DropdownButton items={clusters} isLoading={isLoading} size="compact" wrap fillParent>
					{props.value?.clusterName || "Make Selection"}
				</DropdownButton>
			)}
		</div>
	);
};
