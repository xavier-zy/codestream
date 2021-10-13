import React, { useEffect, useState } from "react";
import { useSelector, useDispatch, shallowEqual } from "react-redux";
import { PaneHeader, PaneBody, PaneState, PaneNode, PaneNodeName } from "../src/components/Pane";
import { WebviewPanels } from "../ipc/webview.protocol.common";
import { CodeStreamState } from "../store";
import { isConnected } from "../store/providers/reducer";
import { Button } from "../src/components/Button";
import { Provider } from "./IntegrationsPanel";
import { configureAndConnectProvider, disconnectProvider } from "../store/providers/actions";
import Icon from "./Icon";
import Tooltip from "./Tooltip";
import { setUserPreference } from "./actions";
import { Row } from "./CrossPostIssueControls/IssueDropdown";
import { HostApi } from "../webview-api";
import { HostDidChangeWorkspaceFoldersNotificationType } from "@codestream/protocols/webview";
import Timestamp from "./Timestamp";
import styled from "styled-components";
import { InlineMenu } from "../src/components/controls/InlineMenu";
import { useDidMount, usePrevious } from "../utilities/hooks";
import {
	EntityAccount,
	GetObservabilityEntitiesRequestType,
	GetObservabilityErrorsRequestType,
	GetObservabilityReposRequestType,
	GetObservabilityReposResponse,
	ObservabilityRepo,
	ObservabilityRepoError
} from "@codestream/protocols/agent";

import { keyBy as _keyBy } from "lodash-es";
import { api, openErrorGroup } from "../store/codeErrors/actions";
import { DropdownButton } from "./DropdownButton";

interface Props {
	paneState: PaneState;
}

const EMPTY_HASH = {};

const Root = styled.div`
	height: 100%;
	.pr-row {
		padding-left: 40px;
		.selected-icon {
			left: 20px;
		}
	}
	${PaneNode} ${PaneNode} {
		${PaneNodeName} {
			padding-left: 40px;
		}
		.pr-row {
			padding-left: 60px;
			.selected-icon {
				left: 40px;
			}
		}
	}
	#pr-search-input-wrapper .pr-search-input {
		margin: -3px 0 !important;
		padding: 3px 0 !important;
		&:focus {
			padding: 3px 5px !important;
		}
		&:focus::placeholder {
			opacity: 0 !important;
		}
		&:not(:focus) {
			cursor: pointer;
			border: none !important;
		}
		&::placeholder {
			opacity: 1 !important;
			color: var(--text-color);
		}
		&:hover::placeholder {
			color: var(--text-color-highlight);
		}
	}
	${PaneNode} .pr-search {
		padding-left: 40px;
	}
	div.go-pr {
		padding: 0;
		margin-left: auto;
		button {
			margin-top: 0px;
		}
	}
`;

const ErrorRow = (props: {
	title: string;
	tooltip?: string;
	timestamp?: number;
	isLoading?: boolean;
	url?: string;
	onClick?: Function;
}) => {
	return (
		<Row
			className="pr-row"
			onClick={e => {
				props.onClick && props.onClick();
			}}
		>
			<div>{props.isLoading ? <Icon className="spin" name="sync" /> : <Icon name="alert" />}</div>
			<div>
				<Tooltip title={props.tooltip} delay={1} placement="bottom">
					<span>{props.title}</span>
				</Tooltip>
			</div>
			<div className="icons">
				{props.url && (
					<span
						onClick={e => {
							e.preventDefault();
							e.stopPropagation();
						}}
					>
						<Icon
							name="globe"
							className="clickable"
							title="View on New Relic One"
							placement="bottomLeft"
							delay={1}
						/>
					</span>
				)}

				{props.timestamp && <Timestamp time={props.timestamp} relative abbreviated />}
			</div>
		</Row>
	);
};

const EMPTY_ARRAY = [];

interface EntityAssociatorProps {
	remote: string;
	remoteName: string;
	onSuccess: Function;
}

const EntityAssociator = React.memo((props: EntityAssociatorProps) => {
	const dispatch = useDispatch<any>();

	const [entities, setEntities] = useState<{ guid: string; name: string }[]>([]);
	const [selected, setSelected] = useState<{ guid: string; name: string } | undefined>(undefined);
	const [isLoading, setIsLoading] = useState(false);

	useDidMount(() => {
		HostApi.instance
			.send(GetObservabilityEntitiesRequestType, { appName: props.remoteName })
			.then(_ => {
				setEntities(_.entities);
			});
	});

	const items =
		entities.map(_ => {
			return {
				key: _.guid,
				label: _.name,
				action: () => {
					setSelected(_);
				}
			};
		}) || [];

	return (
		<div>
			<p>Associate this repo with an entity on New Relic in order to see errors</p>
			<DropdownButton
				items={items}
				selectedKey={selected ? selected.guid : undefined}
				variant={"secondary"}
				//size="compact"
				wrap
			>
				{selected ? selected.name : "Select entity from New Relic"}
			</DropdownButton>{" "}
			<Button
				isLoading={isLoading}
				disabled={isLoading || !selected}
				onClick={e => {
					e.preventDefault();
					setIsLoading(true);

					const payload = {
						url: props.remote,
						name: props.remoteName,
						applicationEntityGuid: selected?.guid,
						entityId: selected?.guid,
						parseableAccountId: selected?.guid
					};
					dispatch(api("assignRepository", payload)).then(_ => {
						setTimeout(() => {
							if (_?.directives) {
								console.log("assignRepository", {
									directives: _?.directives
								});
								props.onSuccess &&
									props.onSuccess({
										entityGuid: _?.directives.find(d => d.type === "assignRepository")?.data
											?.entityGuid
									});
							} else {
								console.log("Could not find directive", {
									payload: payload
								});
							}
							setIsLoading(false);
						}, 2500);
					});
				}}
			>
				Add Repository
			</Button>
		</div>
	);
});

export const Observability = React.memo((props: Props) => {
	const dispatch = useDispatch();
	const derivedState = useSelector((state: CodeStreamState) => {
		const { providers = {}, preferences } = state;
		const newRelicIsConnected =
			providers["newrelic*com"] && isConnected(state, { id: "newrelic*com" });
		const hiddenPaneNodes = preferences.hiddenPaneNodes || EMPTY_HASH;
		return {
			newRelicIsConnected,
			hiddenPaneNodes,
			observabilityRepoEntities: preferences.observabilityRepoEntities || EMPTY_ARRAY
		};
	}, shallowEqual);

	const [loadingErrors, setLoadingErrors] = useState<{ [repoId: string]: boolean } | undefined>(
		undefined
	);
	const [observabilityErrors, setObservabilityErrors] = useState<ObservabilityRepoError[]>([]);
	const previousHiddenPaneNodes = usePrevious(derivedState.hiddenPaneNodes);
	const [observabilityRepos, setObservabilityRepos] = useState<ObservabilityRepo[]>([]);

	const buildFilters = (repoIds: string[]) => {
		return repoIds.map(repoId => {
			const repoEntity = derivedState.observabilityRepoEntities.find(_ => _.repoId === repoId);
			if (repoEntity) {
				return {
					repoId: repoId,
					entityGuid: repoEntity.entityGuid
				};
			}
			return {
				repoId: repoId
			};
		});
	};

	const loading = (repoIdOrRepoIds: string | string[], isLoading: boolean) => {
		if (Array.isArray(repoIdOrRepoIds)) {
			setLoadingErrors(
				repoIdOrRepoIds.reduce(function(map, obj) {
					map[obj] = isLoading;
					return map;
				}, {})
			);
		} else {
			setLoadingErrors({
				...loadingErrors,
				[repoIdOrRepoIds]: isLoading
			});
		}
	};

	useDidMount(() => {
		const _useDidMount = () => {
			HostApi.instance
				.send(GetObservabilityReposRequestType, {})
				.then((_: GetObservabilityReposResponse) => {
					setObservabilityRepos(_.repos || []);
					let repoIds = _.repos?.filter(r => r.repoId).map(r => r.repoId!) || [];
					const hiddenRepos = Object.keys(hiddenPaneNodes)
						.filter(_ => {
							return _.indexOf("newrelic-errors-in-repo-") === 0 && hiddenPaneNodes[_] === true;
						})
						.map(r => r.replace("newrelic-errors-in-repo-", ""));
					repoIds = repoIds.filter(r => !hiddenRepos.includes(r));

					if (repoIds.length) {
						loading(repoIds, true);

						HostApi.instance
							.send(GetObservabilityErrorsRequestType, {
								filters: buildFilters(repoIds)
							})
							.then(response => {
								if (response?.repos) {
									setObservabilityErrors(response.repos!);
								}
								loading(repoIds, false);
							});
					}
				});
		};

		_useDidMount();

		const disposable = HostApi.instance.on(HostDidChangeWorkspaceFoldersNotificationType, () => {
			_useDidMount();
		});

		return () => {
			disposable && disposable.dispose();
		};
	});

	useEffect(() => {
		if (previousHiddenPaneNodes) {
			Object.keys(derivedState.hiddenPaneNodes).forEach(_ => {
				if (_.indexOf("newrelic-errors-in-repo-") > -1) {
					const repoId = _.replace("newrelic-errors-in-repo-", "");
					if (
						!observabilityErrors.find(_ => _.repoId === repoId) &&
						derivedState.hiddenPaneNodes[_] === false &&
						previousHiddenPaneNodes[_] === true
					) {
						loading(repoId, true);

						HostApi.instance
							.send(GetObservabilityErrorsRequestType, { filters: buildFilters([repoId]) })
							.then(response => {
								if (response?.repos) {
									setObservabilityErrors(response.repos!);
								}
								loading(repoId, false);
							});
					}
				}
			});
		}
	}, [derivedState.hiddenPaneNodes]);

	const fetchEntityRepo = (entityGuid: string, repoId) => {
		loading(repoId, true);

		HostApi.instance
			.send(GetObservabilityReposRequestType, {
				filters: [{ repoId: repoId, entityGuid: entityGuid }]
			})
			.then(response => {
				if (response?.repos) {
					const existingObservabilityRepos = observabilityRepos.filter(_ => _.repoId !== repoId);
					existingObservabilityRepos.push(response.repos[0]);
					setObservabilityRepos(existingObservabilityRepos!);
				}

				loading(repoId, false);
			});
	};

	const selectEntityAccount = (entityGuid: string, repoId) => {
		loading(repoId, true);

		HostApi.instance
			.send(GetObservabilityErrorsRequestType, {
				filters: [{ repoId: repoId, entityGuid: entityGuid }]
			})
			.then(response => {
				if (response?.repos) {
					const existingObservabilityErrors = observabilityErrors.filter(_ => _.repoId !== repoId);
					existingObservabilityErrors.push(response.repos[0]);
					setObservabilityErrors(existingObservabilityErrors!);
				}
				loading(repoId, false);
			})
			.catch(_ => {
				console.warn(_);
				setLoadingErrors({
					...loadingErrors,
					[repoId]: false
				});
			});
	};

	const settingsMenuItems = [
		{
			label: "Disconnect",
			key: "disconnect",
			action: () => dispatch(disconnectProvider("newrelic*com", "Sidebar"))
		}
	];

	const buildSelectedLabel = (repoId: string, entityAccounts: EntityAccount[]) => {
		const selected = derivedState.observabilityRepoEntities.find(_ => _.repoId === repoId);
		if (selected) {
			const found = entityAccounts.find(_ => _.entityGuid === selected.entityGuid);
			if (found) {
				return found.entityName;
			}
		} else if (entityAccounts?.length) {
			return entityAccounts[0].entityName;
		}
		return "(select)";
	};

	const { hiddenPaneNodes } = derivedState;
	return (
		<Root>
			<PaneHeader title="Observability" id={WebviewPanels.Observability}>
				{derivedState.newRelicIsConnected ? (
					<InlineMenu
						title="Connected to New Relic"
						key="settings-menu"
						className="subtle no-padding"
						noFocusOnSelect
						noChevronDown
						items={settingsMenuItems}
					>
						<Icon name="gear" title="Settings" placement="bottom" delay={1} />
					</InlineMenu>
				) : (
					<>&nbsp;</>
				)}
			</PaneHeader>
			{props.paneState !== PaneState.Collapsed && (
				<PaneBody>
					<div style={{ padding: "0 10px 0 20px" }}></div>
					{derivedState.newRelicIsConnected ? (
						<>
							<PaneNode>
								{observabilityRepos.map((or: ObservabilityRepo) => {
									return (
										<>
											<PaneNodeName
												title={"Recent errors in " + or.repoName}
												id={"newrelic-errors-in-repo-" + or.repoId}
												subtitle={
													!or.entityAccounts || or.entityAccounts.length < 2 ? (
														undefined
													) : (
														<>
															<InlineMenu
																key="codemark-display-options"
																className="subtle no-padding"
																noFocusOnSelect
																items={or.entityAccounts.map((ea, index) => {
																	return {
																		label: ea.entityName,
																		subtle:
																			ea.accountName && ea.accountName.length > 15
																				? ea.accountName.substr(0, 15) + "..."
																				: ea.accountName,
																		key: ea.entityGuid,
																		//icon: <Icon name="file" />,
																		action: () => {
																			selectEntityAccount(ea.entityGuid, or.repoId);
																			const newPreferences = derivedState.observabilityRepoEntities.filter(
																				_ => _.repoId !== or.repoId
																			);
																			newPreferences.push({
																				repoId: or.repoId,
																				entityGuid: ea.entityGuid
																			});
																			dispatch(
																				setUserPreference(
																					["observabilityRepoEntities"],
																					newPreferences
																				)
																			);
																		},
																		checked: !!derivedState.observabilityRepoEntities.find(
																			_ => _.repoId === or.repoId && _.entityGuid === ea.entityGuid
																		)
																	};
																})}
																title="Entities"
															>
																{buildSelectedLabel(or.repoId, or.entityAccounts)}
															</InlineMenu>
														</>
													)
												}
											></PaneNodeName>
											{loadingErrors && loadingErrors[or.repoId] ? (
												<>
													<ErrorRow isLoading={true} title="Loading..."></ErrorRow>
												</>
											) : (
												<>
													{!hiddenPaneNodes["newrelic-errors-in-repo-" + or.repoId] && (
														<>
															{observabilityErrors?.find(
																oe => oe.repoId === or.repoId && oe.errors.length > 0
															) ? (
																<>
																	{observabilityErrors
																		.filter(oe => oe.repoId === or.repoId)
																		.map((ugh: any) => {
																			return ugh.errors.map(err => {
																				return (
																					<ErrorRow
																						title={`${err.errorClass} (${err.count})`}
																						tooltip={err.message}
																						timestamp={err.lastOccurrence}
																						onClick={e => {
																							dispatch(
																								openErrorGroup(
																									err.errorGroupGuid,
																									err.occurrenceId,
																									{
																										remote: ugh.remote,
																										pendingEntityId: err.entityId,
																										occurrenceId: err.occurrenceId,
																										pendingErrorGroupGuid: err.errorGroupGuid
																									}
																								)
																							);
																						}}
																					/>
																				);
																			});
																		})}
																</>
															) : or.hasRepoAssociation ? (
																<ErrorRow title="No errors to display" />
															) : (
																<div style={{ padding: "0px 35px" }}>
																	<EntityAssociator
																		onSuccess={e => {
																			fetchEntityRepo(e.entityGuid, or.repoId);
																		}}
																		remote={or.repoRemote}
																		remoteName={or.repoName}
																	/>
																</div>
															)}
														</>
													)}
												</>
											)}
										</>
									);
								})}
							</PaneNode>
						</>
					) : (
						<>
							<div className="filters" style={{ padding: "0 20px 10px 20px" }}>
								<span>
									Connect to New Relic to see errors and debug issues.{" "}
									{/* <Tooltip title="Connect later on the Integrations page" placement="top">
										<Linkish
											onClick={() =>
												dispatch(setUserPreference(["skipConnectObservabilityProviders"], true))
											}
										>
											Skip this step.
										</Linkish>
									</Tooltip> */}
								</span>
							</div>

							<div style={{ padding: "0 20px 20px 20px" }}>
								<Provider
									appendIcon
									style={{ maxWidth: "23em" }}
									key="newrelic"
									onClick={() =>
										dispatch(configureAndConnectProvider("newrelic*com", "Observability Section"))
									}
								>
									<span
										style={{
											fontSize: "smaller",
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap"
										}}
									>
										<Icon name="newrelic" />
										Connect to New Relic One
									</span>
								</Provider>
							</div>
						</>
					)}
				</PaneBody>
			)}
		</Root>
	);
});
