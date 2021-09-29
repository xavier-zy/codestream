import { PixieGetClustersRequestType } from "@codestream/protocols/agent";
import { DropdownButton, DropdownButtonItems } from "@codestream/webview/Stream/DropdownButton";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import { HostApi } from "@codestream/webview/webview-api";
import React, { useEffect } from "react";

export const Clusters = props => {
	const [isLoading, setIsLoading] = React.useState(false);
	const [clusters, setClusters] = React.useState<DropdownButtonItems[]>([]);

	useEffect(() => {
		void loadClusters();
	}, [props.account.id]);

	const loadClusters = async () => {
		setIsLoading(true);
		const response = await HostApi.instance.send(PixieGetClustersRequestType, {
			accountId: props.account.id
		});
		setClusters(
			response.clusters.map(_ => ({
				key: _.clusterId,
				label: _.clusterName,
				action: () => {
					props.onSelect(_);
				}
			}))
		);
		props.onSelect(response.clusters[0]);
		setIsLoading(false);
	};

	return (
		<DropdownButton items={clusters} isLoading={isLoading} size="compact" wrap>
			{props.value?.clusterName || "Cluster"}
		</DropdownButton>
	);
};
