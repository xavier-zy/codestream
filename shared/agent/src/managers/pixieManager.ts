"use strict";

import * as grpcLibrary from "@grpc/grpc-js";
import * as grpcProtoLoader from "@grpc/proto-loader";
import Long from "long";
import os from "os";
import path from "path";
import * as protobuf from "protobufjs";
import { Logger } from "../logger";
import {
    PixieDynamicLoggingReponse,
    PixieDynamicLoggingRequest,
    PixieDynamicLoggingRequestType
} from "../protocol/agent.protocol";
import { NewRelicProvider } from "../providers/newrelic";
import { CodeStreamSession } from "../session";
import { getProvider } from "../system";
import { lsp, lspHandler } from "../system/decorators/lsp";

// see: https://www.npmjs.com/package/protobufjs
protobuf.util.Long = Long;
protobuf.configure();

const DYNAMIC_LOGGING_SCRIPT_TEMPLATE = `
import pxtrace
import px

upid = '$UPID$'

@pxtrace.probe("$PROBE_PATH$")
def probe_func():
    return [{
        $FUNCTION_PARAMETERS$
        'latency': pxtrace.FunctionLatency()
    }]

pxtrace.UpsertTracepoint('$TRACEPOINT_NAME$',
                         '$TRACEPOINT_NAME$',
                         probe_func,
                         px.uint128(upid),
                         "5m")

px.display(px.DataFrame(table='$TRACEPOINT_NAME$'))
`;

@lsp
export class PixieManager {
    constructor(public readonly session: CodeStreamSession) {}

    @lspHandler(PixieDynamicLoggingRequestType)
    async dynamicLogging(request: PixieDynamicLoggingRequest): Promise<PixieDynamicLoggingReponse> {
        const cloudApiPath = path.join(os.homedir(), ".codestream", "protobuf", "pixie", "cloudapi.proto");
        const cloudApiProto = await grpcProtoLoader.load(cloudApiPath);
        const cloudApiPackage = grpcLibrary.loadPackageDefinition(cloudApiProto);
        const cloudApi = cloudApiPackage.px as any;

        const vizierApiPath = path.join(os.homedir(), ".codestream", "protobuf", "pixie", "vizierapi.proto");
        const vizierApiProto = await grpcProtoLoader.load(vizierApiPath);
        const vizierApiPackage = grpcLibrary.loadPackageDefinition(vizierApiProto);
        const vizierApi = vizierApiPackage.px as any;

        // const clusterInfo = new cloudApi.cloudapi.VizierClusterInfo(
        // 	"work.withpixie.ai",
        // 	this.buildCredentials()
        // );
        // const response = clusterInfo.getClusterInfo({}, function(err: any, response: any) {
        // 	console.log(err);
        // 	console.log(response);
        // });

        // const response2 = clusterInfo.getClusterInfo(
        // 	{
        // 		id: {
        // 			lowBits: Long.fromString("0x8dc079d73c05bc7d", false, 16),
        // 			highBits: Long.fromString("0x0177fa3831de40f0", false, 16)
        // 		}
        // 	},
        // 	function(err: any, response: any) {
        // 		console.log(err);
        // 		console.log(response);
        // 	}
        // );

        const vizier = new vizierApi.api.vizierpb.VizierService(
            "work.withpixie.ai",
            await this.buildCredentials()
        );

        let parametersScript = ''
        for (const parameter of request.functionParameters) {
            parametersScript += `'${parameter.name}': pxtrace.ArgExpr("${parameter.name}"),\n`;
        }
        const probePath = request.functionReceiver
            ? `${request.packageName}.(${request.functionReceiver}).${request.functionName}`
            : `${request.packageName}.${request.functionName}`

        const script = DYNAMIC_LOGGING_SCRIPT_TEMPLATE
            .replace(/\$PROBE_PATH\$/g, probePath)
            .replace(/\$TRACEPOINT_NAME\$/g, `${request.functionName}_data_${Date.now()}`)
            .replace(/\$FUNCTION_PARAMETERS\$/g, parametersScript)
            .replace(/\$UPID\$/g, request.upid)

        const promise = new Promise<PixieDynamicLoggingReponse>((resolve, reject) => {

            function poller() {
                let metaData: string[] = [];
                const data: any[] = [];

                const call = vizier.executeScript({
                    queryStr: script,
                    clusterId: "0177fa38-31de-40f0-8dc0-79d73c05bc7d",
                    mutation: true
                });
                call.on("data", function(response: any) {
                    if (response.metaData) {
                        metaData = (response.metaData.relation.columns as any[]).map(c => c.columnName);
                    }
                    if (response.data?.batch?.cols) {
                        const cols = response.data?.batch?.cols;
                        const row: any = {};
                        let hasData = false;

                        for (let i = 0; i < cols.length; i++) {
                            const value = colValue(cols[i]);
                            const key = metaData[i];
                            if (key) {
                                row[key] = value;
                                if (value) {
                                    hasData = true;
                                }
                            }
                        }

                        if (hasData) {
                            data.push(row);
                        }
                    }
                });

                call.on("error", function(err: any) {
                    Logger.error(err);
                    // reject(err);
                });
                call.on("status", function(status: any) {
                    Logger.log(status);
                });
                call.on("end", function() {
                    if (data.length) {
                        resolve({
                            data
                        });
                        Logger.log("this is the end, my only friend, the end");
                    } else {
                        Logger.log("nothing so far");
                        setTimeout(poller, 5000);
                    }
                });
            }
            poller();
        });

        return promise;
    }

    private async buildCredentials() {
        const nrProvider = getProvider("newrelic*com") as NewRelicProvider;
        if (nrProvider != null) {
            const token = await nrProvider.getPixieToken();
            // const token = (await xfs.readText("/Users/mfarias/pixie/pixie.key"))!.trim();
            return grpcLibrary.credentials.combineChannelCredentials(
                grpcLibrary.credentials.createSsl(),
                grpcLibrary.credentials.createFromMetadataGenerator((params, callback) => {
                    const md = new grpcLibrary.Metadata();
                    md.set("authorization", "Bearer " + token);
                    // md.set("pixie-api-key", token);
                    md.set("pixie-api-client", "codestream");
                    return callback(null, md);
                })
            );
        } else {
            throw new Error("Not connected to New Relic");
        }
    }
}

function colValue(col: any): string | undefined {
    if (col.uint128Data?.data?.length) {
        const data = col.uint128Data.data[0];
        const long = new Long(data.low, data.high, data.unsigned);
        return long.toString();
    }
    if (col.time64nsData?.data?.length) {
        const data = col.time64nsData.data[0];
        const long = new Long(data.low, data.high, data.unsigned);
        return long.toString();
    }
    if (col.int64Data?.data?.length) {
        const data = col.int64Data.data[0];
        const long = new Long(data.low, data.high, data.unsigned);
        return long.toString();
    }

    if (col.stringData?.data) {
        return col.stringData.data[0];
    }

    return undefined;
}
