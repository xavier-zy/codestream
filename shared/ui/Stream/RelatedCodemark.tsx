import React from "react";
import { useSelector, useDispatch } from "react-redux";
import cx from "classnames";
import { CodeStreamState } from "../store";
import { getCodemark } from "../store/codemarks/reducer";
import Icon from "./Icon";
import { HostApi } from "../webview-api";
import { setCurrentCodemark } from "../store/context/actions";

export function RelatedCodemark(props: { id: string; className?: string }) {
	const dispatch = useDispatch();
	const codemark = useSelector((state: CodeStreamState) => {
		return getCodemark(state.codemarks, props.id);
	});

	// React.useEffect(() => {
	// 	if (!codemark) {
	// 		// TODO: fetch it when the api is ready
	// 	}
	// }, []);

	const handleClickRelatedCodemark = React.useCallback(
		event => {
			event.preventDefault();
			event.stopPropagation();
			HostApi.instance.track("Codemark Clicked", {
				"Codemark ID": props.id,
				"Codemark Location": "Related List"
			});

			dispatch(setCurrentCodemark(codemark!.id));
		},
		[props.id]
	);

	if (!codemark) {
		return null;
	}

	const color = codemark.pinned ? (codemark.status === "closed" ? "purple" : "green") : "gray";
	const icon = <Icon name={codemark.type || "comment"} className={`${color}-color type-icon`} />;

	const marker = codemark.markers && codemark.markers[0];
	const file = marker && marker.file;
	const resolved = codemark.status === "closed";

	return (
		<div
			key={codemark.id}
			className={cx("related-codemark", props.className)}
			onClick={handleClickRelatedCodemark}
		>
			{icon}&nbsp;{codemark.title || codemark.text}
			<span className="codemark-file">{file}</span>
		</div>
	);
}
