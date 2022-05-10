package com.codestream.editor

import com.codestream.agentService
import com.codestream.extensions.selectionOrCurrentLine
import com.codestream.extensions.textDocumentIdentifier
import com.codestream.extensions.uri
import com.codestream.protocols.agent.CreateShareableCodemarkParams
import com.codestream.protocols.agent.ScmRangeInfoParams
import com.codestream.protocols.agent.ShareableCodemarkAttributes
import com.codestream.protocols.webview.DocumentMarkerNotifications
import com.codestream.protocols.webview.PullRequestNotifications
import com.codestream.review.PARENT_POST_ID
import com.codestream.review.PULL_REQUEST
import com.codestream.sessionService
import com.codestream.webViewService
import com.intellij.codeInsight.completion.PlainPrefixMatcher
import com.intellij.codeInsight.completion.PrefixMatcher
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.impl.EditorImpl
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.wm.IdeFocusManager
import com.intellij.ui.TextFieldWithAutoCompletionListProvider
import com.intellij.ui.components.labels.LinkLabel
import com.intellij.util.io.HttpRequests
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import java.awt.Image
import java.awt.event.ComponentEvent
import javax.swing.Icon
import javax.swing.ImageIcon
import javax.swing.JComponent

class InlineTextFieldManager(val editor: Editor) {

    private val logger = Logger.getInstance(InlineTextFieldManager::class.java)
    private val inlaysManager = (editor as? EditorImpl)?.let { EditorComponentInlaysManager(it) }
    private var inlay: Disposable? = null
    private var component: JComponent? = null
    private val actionName = "Add Comment"
    private val agent = editor.project?.agentService
    private val webview = editor.project?.webViewService
    private val parentPostId = editor.document.getUserData(PARENT_POST_ID)

    init {
        if (editor !is EditorImpl) {
            logger.warn("Editor $editor is not an EditorImpl")
        }
    }

    private val hideCallback: (() -> Unit) = {
        ApplicationManager.getApplication().invokeLater {
            inlay?.let {
                Disposer.dispose(it)
            }
            inlay = null
            component = null
        }
    }


    private fun createSubmitter(isReview: Boolean?): (String) -> Unit {
        return  {
            val range = editor.selectionOrCurrentLine

            GlobalScope.launch {
                if (agent == null) return@launch
                if (webview == null) return@launch
                val uri = editor.document.uri ?: return@launch

                try {
                    val scmRangeInfoResult = agent.scmRangeInfo(
                        ScmRangeInfoParams(
                            uri,
                            range
                        )
                    )

                    val mentionedUsers = if (editor.document.getUserData(PULL_REQUEST) == null) {
                        val users = agent.getUsers()
                        val potentialUsernames = "@([A-Za-z0-9]+)".toRegex().findAll(it).map { it.value }
                        users.filter { potentialUsernames.contains("@${it.username}") }.map { it.id }
                    } else {
                        null
                    }

                    val createCodemarkResult = agent.createShareableCodemark(
                        CreateShareableCodemarkParams(
                            ShareableCodemarkAttributes(
                                "comment",
                                it,
                                parentPostId,
                                null,
                                listOf(scmRangeInfoResult)
                            ),
                            parentPostId,
                            listOf(),
                            editor.document.textDocumentIdentifier?.let { listOf(it) },
                            null,
                            mentionedUsers,
                            null,
                            isReview,
                            "JetBrains",
                        )
                    )
                    if (createCodemarkResult.pullRequest != null && createCodemarkResult.directives != null) {
                        webview.postNotification(
                            PullRequestNotifications.HandleDirectives(
                                createCodemarkResult.pullRequest,
                                createCodemarkResult.directives
                            )
                        )
                        editor.document.textDocumentIdentifier?.let {
                            webview.postNotification(DocumentMarkerNotifications.DidChange(it))
                        }
                    }

                    println(createCodemarkResult)
                } catch (e: Exception) {
                    logger.error(e)
                } finally {
                    hideCallback()
                }
            }
        }


    }

    fun showTextField(isReview: Boolean? = true) {
        component?.let {
            doFocus(it)
            return
        }

        // val icn = IconLoader.CachedImageIcon(URL(avatarUrl), true)

        // myState.iconBytes = Base64.getEncoder().encodeToString(bytes)

        // val icn = IconLoader.getgetIcon("/images/avatar_small.png")
        // val model = InlineTextFieldModel("", submitter)

        GlobalScope.launch {
            val pullRequest = editor.document.getUserData(PULL_REQUEST)
            val users = pullRequest?.collaborators?.map {
                with(it) {
                    val icon = it.avatar.image?.let {
                        val bytes: ByteArray = HttpRequests.request(it).readBytes(null)
                        val tempIcon = ImageIcon(bytes)
                        val image: Image = tempIcon.image
                        val resizedImage: Image = image.getScaledInstance(20, 20, Image.SCALE_SMOOTH)
                        ImageIcon(resizedImage)
                    }

                    InlineTextFieldMentionableProviderUser(
                        id,
                        username,
                        icon
                    )
                }
            }
            ?: (editor.project?.agentService?.getUsers() ?: listOf()).map {
                with(it) {
                    InlineTextFieldMentionableCSUser(
                        id,
                        username,
                        fullName
                    )
                }
            }

            ApplicationManager.getApplication().invokeLater {

                // val descriptor = object : DefaultTextCompletionValueDescriptor<CSUser>() {
                //     override fun getLookupString(item: CSUser): String {
                //         return "@${item.username}"
                //     }
                //
                //     override fun getTypeText(item: CSUser): String {
                //         return item.fullName
                //     }
                // }

                val completionProvider =
                    object : TextFieldWithAutoCompletionListProvider<InlineTextFieldMentionableUser>(users) {
                        override fun compare(item1: InlineTextFieldMentionableUser?, item2: InlineTextFieldMentionableUser?): Int {
                            return StringUtil.compare(item1?.username, item2?.username, false)
                        }

                        override fun getLookupString(item: InlineTextFieldMentionableUser): String {
                            return "@${item.username}"
                        }

                        override fun getTypeText(item: InlineTextFieldMentionableUser): String? {
                            return (item as? InlineTextFieldMentionableCSUser)?.fullName
                        }

                        override fun createPrefixMatcher(prefix: String): PrefixMatcher {
                            return PlainPrefixMatcher(prefix, true)
                        }

                        override fun getIcon(item: InlineTextFieldMentionableUser): Icon? {
                            return (item as? InlineTextFieldMentionableProviderUser)?.icon
                        }
                    }

                // val completionProvider = ValuesCompletionProvider(descriptor, users)
                // val completionProvider = TextFieldWithAutoCompletion.StringsCompletionProvider(listOf("@lee", "@lifeson", "@peart"), null)
                // val completionProvider2 = TextFieldWithAutoCompletion.StringsCompletionProvider(users.map { "@${it.username}" }, null)

                val authorLabel = LinkLabel.create("") {
                    // BrowserUtil.browse("https://github.com")
                }.apply {
                    // icon = avatarIconsProvider.getIcon("https://avatars.githubusercontent.com/u/1028286?v=4")
                    isFocusable = true
                    border = JBUI.Borders.empty(InlineTextField.getEditorTextFieldVerticalOffset() - 2, 0)
                    putClientProperty(UIUtil.HIDE_EDITOR_FROM_DATA_CONTEXT_PROPERTY, true)
                }
                GlobalScope.launch {
                    authorLabel.icon = editor.project?.sessionService?.userLoggedIn?.avatarIcon
                }

                val textField = InlineTextField(
                    editor.project!!,
                    actionName,
                    createSubmitter(isReview),
                    completionProvider,
                    authorLabel,
                    hideCallback
                ).apply {
                    border = JBUI.Borders.empty(8)
                }.let(::wrapComponentUsingRoundedPanel)

                component = textField
                inlay = inlaysManager?.insertAfter(editor.selectionOrCurrentLine.end.line, textField)
                val viewport = (editor as? EditorImpl)?.scrollPane?.viewport
                // https://intellij-support.jetbrains.com/hc/en-us/community/posts/360010505760-Issues-embedding-editor-in-block-inlay
                viewport?.dispatchEvent(ComponentEvent(viewport, ComponentEvent.COMPONENT_RESIZED))

                doFocus(textField)
            }
        }
    }

    private fun doFocus(textField: JComponent) {
        val focusManager = IdeFocusManager.findInstanceByComponent(textField)
        val toFocus = focusManager.getFocusTargetFor(textField) ?: return
        focusManager.doWhenFocusSettlesDown { focusManager.requestFocus(toFocus, true) }
    }
}