package com.codestream.editor

import com.codestream.agentService
import com.codestream.codeStream
import com.codestream.editorService
import com.codestream.extensions.ifNullOrBlank
import com.codestream.extensions.uri
import com.codestream.protocols.CodemarkType
import com.codestream.protocols.agent.DocumentMarker
import com.codestream.protocols.agent.TelemetryParams
import com.codestream.protocols.webview.CodemarkNotifications
import com.codestream.protocols.webview.PullRequestNotifications
import com.codestream.webViewService
import com.intellij.codeInsight.highlighting.TooltipLinkHandler
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.ui.ColorUtil
import com.intellij.ui.JBColor
import org.eclipse.lsp4j.Position
import org.eclipse.lsp4j.Range
import java.text.SimpleDateFormat
import java.util.Date
import javax.swing.Icon

class GutterIconRendererImpl(val editor: Editor, val marker: DocumentMarker) : GutterIconRenderer() {
    val id: String
        get() = marker.id

    override fun isNavigateAction(): Boolean {
        return true
    }

    override fun getClickAction(): AnAction = GutterIconAction(editor, marker)

    override fun getTooltipText(): String? {
        val dateFormat = SimpleDateFormat("MMMM d, YYYY h:mma")
        var tooltip = "<b>${marker.creatorName}</b> (${dateFormat.format(Date(marker.createdAt))})" +
            "\n\n"
        val rangeString = serializeRange(marker.range);

        if (marker.codemark !== null) {
            if (marker.type == "issue") {
                tooltip += "<img src='${getIconLink("issue")}'> &nbsp; "
            } else if(marker.codemark.reviewId !== null) {
                tooltip += "<img src='${getIconLink("fr")}'> &nbsp; "
                if (marker.title !== null) {
                    tooltip += "${marker.title} \n\n"
                }
            } else {
                tooltip += "<img src='${getIconLink("comment")}'> &nbsp; "
            }
            tooltip += marker.summary
            tooltip += "\n\n<a href='#codemark/show/${marker.codemark.id}'>View Comment</a>"
            tooltip += "<hr style='margin-top: 3px; margin-bottom: 3px;'>"
            tooltip += "<a href='#codemark/link/${CodemarkType.COMMENT},${rangeString}'>Add Comment</a> &#183; " +
                "<a href='#codemark/link/${CodemarkType.ISSUE},${rangeString}'>Create Issue</a> &#183; " +
                "<a href='#codemark/link/${CodemarkType.LINK},${rangeString}'>Get Permalink</a>"
        } else if (marker.externalContent != null) {
            tooltip += "<img src='${getIconLink("pr")}'> &nbsp; "
            if (marker.title !== null) {
                tooltip += "${marker.title} \n\n"
            }
            tooltip += marker.summary
            tooltip += "\n\n<a href='#pr/show/${marker.externalContent.provider?.id}" +
                "/${marker.externalContent.externalId}/${marker.externalContent.externalChildId}'>View Comment</a>"
            tooltip += "<hr style='margin-top: 3px; margin-bottom: 3px;'>"
            tooltip += "<a href='#codemark/link/${CodemarkType.COMMENT},${rangeString}'>Add Comment</a>"
        }

        return tooltip
    }

    override fun getIcon(): Icon {
        val type = marker.type.ifNullOrBlank { "comment" }
        val color = marker.codemark?.color.ifNullOrBlank { "blue" }
        return IconLoader.getIcon("/images/marker-$type-$color.svg")
    }

    override fun getAlignment() = Alignment.LEFT

    override fun equals(other: Any?): Boolean {
        val otherRenderer = other as? GutterIconRendererImpl ?: return false
        return id == otherRenderer.id
    }

    override fun hashCode(): Int {
        return id.hashCode()
    }

    fun getIconLink(type: String): String {
        val bg = JBColor.background()
        var color = "dark";
        if (ColorUtil.isDark(bg)) {
            color = "light"
        }
        val icon = IconLoader.getIcon("/images/icon14/marker-$type-$color.png");

        return (icon as IconLoader.CachedImageIcon).url.toString()
    }

    fun serializeRange(range: Range): String{
        var rangeString = "";
        rangeString += "${range.start.line},";
        rangeString += "${range.start.character},";
        rangeString += "${range.end.line},";
        rangeString += "${range.end.character}";
        return rangeString;
    }
}

class GutterIconAction(val editor: Editor, val marker: DocumentMarker) : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = editor.project ?: return
        marker.codemark?.let {
            project.codeStream?.show {
                project.webViewService?.postNotification(
                    CodemarkNotifications.Show(
                        it.id,
                        editor.document.uri
                    )
                )
            }
            telemetry(project, TelemetryEvent.CODEMARK_CLICKED)
        }
        marker.externalContent?.let {
            it.provider?.let { provider ->
                project.webViewService?.postNotification(
                    PullRequestNotifications.Show(
                        provider.id,
                        it.externalId,
                        it.externalChildId
                    )
                )
            }
            telemetry(project, TelemetryEvent.PR_CLICKED)
        }
    }
}

class GutterCodemarkTooltipLinkHandler : TooltipLinkHandler() {
    override fun handleLink(codemarkId: String, editor: Editor): Boolean {
        val project = editor.project ?: return false

        project.codeStream?.show {
            project.webViewService?.postNotification(
                CodemarkNotifications.Show(
                    codemarkId,
                    editor.document.uri
                )
            )
        }
        telemetry(project, TelemetryEvent.CODEMARK_CLICKED)

        return super.handleLink(codemarkId, editor)
    }
}

class GutterPullRequestTooltipLinkHandler : TooltipLinkHandler() {
    override fun handleLink(prLink: String, editor: Editor): Boolean {
        val project = editor.project ?: return false

        val prData = prLink.split("/")

        project.webViewService?.postNotification(
            PullRequestNotifications.Show(
                prData[0],
                prData[1],
                prData[2]
            )
        )
        telemetry(project, TelemetryEvent.CODEMARK_CLICKED)

        return super.handleLink(prLink, editor)
    }
}

class GutterCodemarkLinkTooltipLinkHandler : TooltipLinkHandler() {
    override fun handleLink(options: String, editor: Editor): Boolean {
        val project = editor.project ?: return false

        val optionsData = options.split(',')
        val codemarkRange = Range(
            Position(optionsData[1].toInt(), optionsData[2].toInt()),
            Position(optionsData[3].toInt(), optionsData[4].toInt())
        );

        project.editorService?.activeEditor?.run {
            project.codeStream?.show {
                project.webViewService?.postNotification(
                    CodemarkNotifications.New(
                        document.uri,
                        codemarkRange,
                        when (optionsData[0]) {
                            "COMMENT" -> CodemarkType.COMMENT
                            "ISSUE" -> CodemarkType.ISSUE
                            "LINK" -> CodemarkType.LINK
                            else -> CodemarkType.COMMENT
                        },
                        "Codemark"
                    )
                )
            }
        }

        return super.handleLink(options, editor)
    }
}

private enum class TelemetryEvent(val value: String, val properties: Map<String, String>) {
    CODEMARK_CLICKED("Codemark Clicked", mapOf("Codemark Location" to "Source File")),
    PR_CLICKED("PR Comment Clicked", mapOf("Codemark Location" to "Source File"))
}

private fun telemetry(project: Project, event: TelemetryEvent) {
    val params = TelemetryParams(event.value, event.properties)
    project.agentService?.agent?.telemetry(params)
}
