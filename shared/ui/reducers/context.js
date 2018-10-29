const initialState = {
	currentFile: "",
	mostRecentSourceFile: "",
	currentTeamId: "",
	currentRepoId: "",
	currentCommit: "",
	panel: "channels",
	panelStack: [], // stores the stack of panels
	noAccess: false, // Legacy
	showSlackInfo: false, // Legacy
	hasFocus: true, // we assume we start with the focus when codestream initializes
	usernamesInTeam: [] // Legacy
};

export default (state = initialState, { type, payload }) => {
	if (type === "RESET_CONTEXT")
		return { ...initialState, currentFile: state.currentFile, currentCommit: state.currentCommit };
	if (type === "SET_CONTEXT") return { ...state, ...payload };
	if (type === "SET_CURRENT_FILE") {
		const file = payload.editor && payload.editor.fileName;
		if (file) return { ...state, currentFile: file, mostRecentSourceFile: file };
		else return { ...state, currentFile: "" };
	}
	if (type === "SET_CURRENT_TEAM") return { ...state, currentTeamId: payload };
	if (type === "SET_CURRENT_STREAM") return { ...state, currentStreamId: payload };
	if (type === "SET_CURRENT_REPO") return { ...state, currentRepoId: payload };
	if (type === "SET_CURRENT_COMMIT") return { ...state, currentCommit: payload };
	if (type === "SET_PANEL") {
		// set the current panel and keep a stack of the most
		// recent ones, so we can pop the current panel off the
		// stack, and return to the prior one
		const panelStack = [payload, ...state.panelStack].slice(0, 10); // limit size
		return { ...state, panel: payload, panelStack };
	}
	if (type === "CLOSE_PANEL") {
		const [panel, ...panelStack] = state.panelStack;
		return { ...state, panel, panelStack };
	}
	if (type === "COMMIT_HASH_CHANGED") return { ...state, currentCommit: payload };
	if (type === "SET_HAS_FOCUS") return { ...state, hasFocus: payload };
	if (type === "NO_ACCESS") return { ...state, noAccess: { noAccess: true } };
	if (type === "NO_ACCESS-MISSING_REMOTE_URL") return { ...state, noAccess: { noUrl: true } };
	if (type === "NO_GIT_IN_PATH") return { ...state, noAccess: { noGit: true } };
	if (type === "SHOW_SLACK_INFO") return { ...state, showSlackInfo: true };
	if (type === "CANCEL_SLACK_INFO") return { ...state, showSlackInfo: false };
	return { ...initialState, ...state };
};
