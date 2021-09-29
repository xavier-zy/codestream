import { PixieGetPodsRequestType } from "@codestream/protocols/agent";
import { DropdownButton, DropdownButtonItems } from "@codestream/webview/Stream/DropdownButton";
import { useDidMount } from "@codestream/webview/utilities/hooks";
import { HostApi } from "@codestream/webview/webview-api";
import React, { useEffect } from "react";

export const Pods = props => {
    const [isLoading, setIsLoading] = React.useState(false);
    const [pods, setPods] = React.useState<DropdownButtonItems[]>([]);
    const [error, setError] = React.useState<string | undefined>();

    useEffect(() => {
        void loadPods();
    }, [props.account.id, props.cluster.clusterId, props.namespace]);

    const loadPods = async () => {
        setIsLoading(true);
        try {
            const response = await HostApi.instance.send(PixieGetPodsRequestType, {
                accountId: props.account.id,
                clusterId: props.cluster.clusterId,
                namespace: props.namespace
            });
            setPods(
                response.pods.map(_ => ({
                    key: _.upid,
                    label: _.name,
                    action: () => {
                        props.onSelect(_);
                    }
                }))
            );
            setError(undefined);
            props.onSelect(response.pods[0]);
        } catch (err) {
            setError(err.toString());
            props.onSelect(undefined);
            setPods([]);
        }
        setIsLoading(false);
    };

    return (
        <div style={{ padding: "0px 0px 1px 0px" }}>
            {error
                ?
                <small className="explainer error-message">
                    {error}
                </small>
                :
                <DropdownButton items={pods} isLoading={isLoading} size="compact">
                    {props.value?.name || "Pod"}
                </DropdownButton>
            }
        </div>
    );
};
