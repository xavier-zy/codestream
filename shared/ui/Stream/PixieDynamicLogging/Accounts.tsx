import { GetNewRelicAccountsRequestType } from "@codestream/protocols/agent";
import { DropdownButton, DropdownButtonItems } from "@codestream/webview/Stream/DropdownButton";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import { HostApi } from "@codestream/webview/webview-api";
import React from "react";

export const Accounts = props => {
	const [isLoading, setIsLoading] = React.useState(false);
	const [accounts, setAccounts] = React.useState<DropdownButtonItems[]>([]);

	useDidMount(() => {
		void loadAccounts();
	});

	const loadAccounts = async () => {
		setIsLoading(true);
		const response = await HostApi.instance.send(GetNewRelicAccountsRequestType, void {});
		setAccounts(
			response.accounts.map(_ => ({
				key: _.id.toString(),
				label: _.name,
				action: () => {
					props.onSelect(_);
				}
			}))
		);
		props.onSelect(response.accounts[0]);
		setIsLoading(false);
	};

	return (
		<DropdownButton items={accounts} isLoading={isLoading} size="compact" wrap>
			{props.value?.name || "Account"}
		</DropdownButton>
	);
};
