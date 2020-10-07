package com.codestream.agent

import com.codestream.agentService
import com.codestream.extensions.uri
import com.codestream.extensions.workspaceFolders
import com.intellij.openapi.module.Module
import com.intellij.openapi.module.impl.scopes.ModuleWithDependenciesScope
import com.intellij.openapi.project.ModuleListener
import com.intellij.openapi.project.Project
import org.eclipse.lsp4j.DidChangeWorkspaceFoldersParams
import org.eclipse.lsp4j.WorkspaceFolder
import org.eclipse.lsp4j.WorkspaceFoldersChangeEvent

class ModuleListenerImpl(project: Project) : ModuleListener {

    override fun moduleAdded(project: Project, module: Module) {
        val existingFolders = project.workspaceFolders
        val roots = (module.moduleContentScope as? ModuleWithDependenciesScope)?.roots ?: return
        val folders = roots.map { WorkspaceFolder(it.uri) }.filter { !existingFolders.contains(it)  }
        if (folders.isEmpty()) return

        project.agentService?.let {
            it.onDidStart {
                it.agent.workspaceService.didChangeWorkspaceFolders(
                    DidChangeWorkspaceFoldersParams(
                        WorkspaceFoldersChangeEvent(
                            folders.toMutableList(),
                            mutableListOf()
                        )
                    )
                )

            }
        }
    }

    override fun moduleRemoved(project: Project, module: Module) {
        val roots = (module.moduleContentScope as? ModuleWithDependenciesScope)?.roots ?: return
        val folders = roots.map { WorkspaceFolder(it.uri) }
        project.agentService?.let {
            it.onDidStart {
                it.agent.workspaceService.didChangeWorkspaceFolders(
                    DidChangeWorkspaceFoldersParams(
                        WorkspaceFoldersChangeEvent(
                            mutableListOf(),
                            folders.toMutableList()
                        )
                    )
                )
            }
        }
    }
}
