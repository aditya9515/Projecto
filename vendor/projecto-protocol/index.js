"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeHealthResponseSchema = exports.ProjectoEventSchema = exports.ProjectoCommandSchema = exports.EditorRunOutputEventSchema = exports.EditorRunOutputKindSchema = exports.EditorRunEventSchema = exports.EditorRunStatusSchema = exports.EditorTerminalCommandSchema = exports.EditorTerminalLocationSchema = exports.RunCommandRequestSchema = exports.RunProfileRequestSchema = exports.ProjectStatusResponseSchema = exports.LaunchCommandSummarySchema = exports.LaunchProfileSummarySchema = exports.ProjectStatusRequestSchema = exports.WorkspaceRegistrationSchema = exports.ExtensionRegistrationSchema = exports.BridgeAuthStateSchema = exports.ProjectoEventTypeSchema = exports.ProjectoCommandTypeSchema = exports.BridgeConnectionStatusSchema = exports.DesktopPlatformSchema = exports.PROTOCOL_VERSION = void 0;
const zod_1 = require("zod");
exports.PROTOCOL_VERSION = '0.1.0';
exports.DesktopPlatformSchema = zod_1.z.enum(['windows', 'macos', 'linux']);
exports.BridgeConnectionStatusSchema = zod_1.z.enum(['connected', 'disconnected']);
exports.ProjectoCommandTypeSchema = zod_1.z.enum([
    'OPEN_PROJECT',
    'RUN_PROFILE',
    'RUN_COMMAND',
    'REGISTER_WORKSPACE',
    'GET_PROJECT_STATUS',
    'OPEN_EDITOR_TERMINAL',
    'OPEN_PROJECTO_APP',
]);
exports.ProjectoEventTypeSchema = zod_1.z.enum([
    'BRIDGE_READY',
    'EXTENSION_REGISTERED',
    'WORKSPACE_REGISTERED',
    'PROJECT_STATUS',
    'RUN_REQUESTED',
    'RUN_COMMAND_IN_EDITOR',
    'STOP_RUN_IN_EDITOR',
    'REVEAL_EDITOR_TERMINAL',
    'RUN_STATUS',
    'ERROR',
]);
exports.BridgeAuthStateSchema = zod_1.z.object({
    protocolVersion: zod_1.z.literal(exports.PROTOCOL_VERSION),
    host: zod_1.z.literal('127.0.0.1'),
    port: zod_1.z.number().int().min(1).max(65_535),
    token: zod_1.z.string().min(24),
    updatedAt: zod_1.z.string().datetime(),
});
exports.ExtensionRegistrationSchema = zod_1.z.object({
    protocolVersion: zod_1.z.string().min(1),
    extensionId: zod_1.z.string().min(1),
    extensionVersion: zod_1.z.string().min(1),
    editorName: zod_1.z.string().min(1),
    editorVersion: zod_1.z.string().min(1).optional(),
    machineName: zod_1.z.string().min(1).optional(),
    workspacePaths: zod_1.z.array(zod_1.z.string().min(1)).default([]),
});
exports.WorkspaceRegistrationSchema = zod_1.z.object({
    protocolVersion: zod_1.z.string().min(1),
    extensionId: zod_1.z.string().min(1),
    editorName: zod_1.z.string().min(1),
    workspacePath: zod_1.z.string().min(1),
});
exports.ProjectStatusRequestSchema = zod_1.z.object({
    workspacePath: zod_1.z.string().min(1),
});
exports.LaunchProfileSummarySchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    name: zod_1.z.string().min(1),
    commandIds: zod_1.z.array(zod_1.z.string().min(1)).default([]),
});
exports.LaunchCommandSummarySchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
    label: zod_1.z.string().min(1),
    command: zod_1.z.string().min(1),
    cwd: zod_1.z.string().min(1),
});
exports.ProjectStatusResponseSchema = zod_1.z.object({
    matched: zod_1.z.boolean(),
    project: zod_1.z
        .object({
        id: zod_1.z.string().min(1),
        name: zod_1.z.string().min(1),
        path: zod_1.z.string().min(1),
        launchProfiles: zod_1.z.array(exports.LaunchProfileSummarySchema).default([]),
        commands: zod_1.z.array(exports.LaunchCommandSummarySchema).default([]),
    })
        .nullable(),
});
exports.RunProfileRequestSchema = zod_1.z.object({
    projectId: zod_1.z.string().min(1),
    profileId: zod_1.z.string().min(1),
    source: zod_1.z.enum(['desktop', 'extension']).default('extension'),
});
exports.RunCommandRequestSchema = zod_1.z.object({
    projectId: zod_1.z.string().min(1),
    commandId: zod_1.z.string().min(1),
    source: zod_1.z.enum(['desktop', 'extension']).default('extension'),
});
exports.EditorTerminalLocationSchema = zod_1.z.enum(['panel', 'editor']);
exports.EditorTerminalCommandSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    projectId: zod_1.z.string().min(1),
    projectName: zod_1.z.string().min(1),
    workspacePath: zod_1.z.string().min(1),
    commandId: zod_1.z.string().min(1),
    label: zod_1.z.string().min(1),
    command: zod_1.z.string().min(1),
    cwd: zod_1.z.string().min(1),
    terminalLocation: exports.EditorTerminalLocationSchema.default('panel'),
});
exports.EditorRunStatusSchema = zod_1.z.enum([
    'accepted',
    'running',
    'completed',
    'failed',
    'stopped',
    'terminal_closed',
]);
exports.EditorRunEventSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    projectId: zod_1.z.string().min(1).optional(),
    commandId: zod_1.z.string().min(1).optional(),
    status: exports.EditorRunStatusSchema,
    message: zod_1.z.string().min(1).optional(),
    exitCode: zod_1.z.number().nullable().optional(),
    timestamp: zod_1.z.string().datetime().optional(),
});
exports.EditorRunOutputKindSchema = zod_1.z.enum(['stdout', 'stderr', 'url-detected']);
exports.EditorRunOutputEventSchema = zod_1.z.object({
    jobId: zod_1.z.string().min(1),
    projectId: zod_1.z.string().min(1).optional(),
    commandId: zod_1.z.string().min(1).optional(),
    kind: exports.EditorRunOutputKindSchema,
    message: zod_1.z.string(),
    url: zod_1.z.string().url().optional(),
    timestamp: zod_1.z.string().datetime().optional(),
});
exports.ProjectoCommandSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({
        type: zod_1.z.literal('OPEN_PROJECT'),
        projectId: zod_1.z.string().min(1),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('RUN_PROFILE'),
        projectId: zod_1.z.string().min(1),
        profileId: zod_1.z.string().min(1),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('RUN_COMMAND'),
        projectId: zod_1.z.string().min(1),
        commandId: zod_1.z.string().min(1),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('REGISTER_WORKSPACE'),
        workspacePath: zod_1.z.string().min(1),
        editor: zod_1.z.string().min(1),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('GET_PROJECT_STATUS'),
        workspacePath: zod_1.z.string().min(1),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('OPEN_EDITOR_TERMINAL'),
        projectId: zod_1.z.string().min(1),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('OPEN_PROJECTO_APP'),
    }),
]);
exports.ProjectoEventSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({
        type: zod_1.z.literal('BRIDGE_READY'),
        protocolVersion: zod_1.z.string().min(1),
        port: zod_1.z.number().int().min(1).max(65_535),
        timestamp: zod_1.z.string().datetime(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('EXTENSION_REGISTERED'),
        extensionId: zod_1.z.string().min(1),
        editorName: zod_1.z.string().min(1),
        timestamp: zod_1.z.string().datetime(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('WORKSPACE_REGISTERED'),
        extensionId: zod_1.z.string().min(1),
        workspacePath: zod_1.z.string().min(1),
        timestamp: zod_1.z.string().datetime(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('PROJECT_STATUS'),
        workspacePath: zod_1.z.string().min(1),
        status: exports.ProjectStatusResponseSchema,
        timestamp: zod_1.z.string().datetime(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('RUN_REQUESTED'),
        projectId: zod_1.z.string().min(1),
        profileId: zod_1.z.string().min(1).optional(),
        commandId: zod_1.z.string().min(1).optional(),
        timestamp: zod_1.z.string().datetime(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('RUN_COMMAND_IN_EDITOR'),
        payload: exports.EditorTerminalCommandSchema,
        timestamp: zod_1.z.string().datetime(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('STOP_RUN_IN_EDITOR'),
        payload: zod_1.z.object({
            jobId: zod_1.z.string().min(1),
        }),
        timestamp: zod_1.z.string().datetime(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('REVEAL_EDITOR_TERMINAL'),
        payload: zod_1.z.object({
            projectId: zod_1.z.string().min(1),
            workspacePath: zod_1.z.string().min(1),
            jobId: zod_1.z.string().min(1).optional(),
        }),
        timestamp: zod_1.z.string().datetime(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('RUN_STATUS'),
        runId: zod_1.z.string().min(1),
        status: zod_1.z.enum(['queued', 'running', 'completed', 'failed', 'stopped']),
        message: zod_1.z.string().min(1).optional(),
        timestamp: zod_1.z.string().datetime(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal('ERROR'),
        message: zod_1.z.string().min(1),
        code: zod_1.z.string().min(1).optional(),
        timestamp: zod_1.z.string().datetime(),
    }),
]);
exports.BridgeHealthResponseSchema = zod_1.z.object({
    ok: zod_1.z.literal(true),
    protocolVersion: zod_1.z.string().min(1),
    extensionConnected: zod_1.z.boolean(),
    registeredWorkspaceCount: zod_1.z.number().int().nonnegative(),
    uptimeSeconds: zod_1.z.number().nonnegative(),
});
