package com.codestream.settings

import com.codestream.codeStream
import com.codestream.gson
import com.codestream.protocols.webview.WebViewContext
import com.codestream.sessionService
import com.github.salomonbrys.kotson.fromJson
import com.github.salomonbrys.kotson.jsonObject
import com.github.salomonbrys.kotson.set
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import kotlin.properties.Delegates

const val INLINE_CODEMARKS = "viewCodemarksInline"

data class SettingsServiceState(
    var teamId: String? = null,
    var webViewConfig: MutableMap<String, String?> = mutableMapOf(
        INLINE_CODEMARKS to "true"
    ),
    var webViewContext: String = "{}"
)

@State(name = "CodeStream", storages = [Storage("codestream.xml")])
class SettingsService(val project: Project) : PersistentStateComponent<SettingsServiceState> {
    private val applicationSettings = ServiceManager.getService(ApplicationSettingsService::class.java)
    private var _state = SettingsServiceState()

    override fun getState(): SettingsServiceState = _state

    override fun loadState(state: SettingsServiceState) {
        _state = state
    }

    val currentStreamId get() = webViewContext?.currentStreamId
    val currentCodemarkId get() = webViewContext?.currentCodemarkId

    var webViewContext by Delegates.observable<WebViewContext?>(null) { _, _, new ->
        _webViewContextObservers.forEach { it(new) }
    }

    // 💩: I HATE THIS
    fun set(name: String, value: String?) {
        if (state.webViewConfig.containsKey(name)) {
            state.webViewConfig[name] = value
        }
    }

    fun getWebViewContextJson(): JsonElement {
        var jsonObject = gson.fromJson<JsonObject>(state.webViewContext)
        project.sessionService?.userLoggedIn?.team?.id.let {
            jsonObject["currentTeamId"] = it
        }
        val codeStream = project.codeStream
        jsonObject["hasFocus"] =
            if (codeStream != null) codeStream.isVisible && codeStream.isFocused
            else false

        jsonObject["__teamless__"] = jsonObject["__teamless__"] ?: JsonObject()
        val teamless = jsonObject["__teamless__"].asJsonObject
        val selectedRegion = teamless["selectedRegion"]
        if (selectedRegion == null || selectedRegion.isJsonNull || selectedRegion.asString.isNullOrBlank()) {
            project.sessionService?.environmentInfo?.environmentHosts?.let { hosts ->
                val shortNames = hosts.map { it.shortName }
                teamless["selectedRegion"] = shortNames.find { it.lowercase().contains("us") } ?: shortNames.first()
            }
        }

        return jsonObject
    }

    fun clearWebViewContext() {
        setWebViewContextJson(jsonObject())
    }

    fun setWebViewContextJson(json: JsonElement) {
        state.webViewContext = json.toString()
        webViewContext = gson.fromJson(json)
    }

    private val _webViewContextObservers = mutableListOf<(WebViewContext?) -> Unit>()
    fun onWebViewContextChanged(observer: (WebViewContext?) -> Unit) {
        _webViewContextObservers += observer
    }
}
