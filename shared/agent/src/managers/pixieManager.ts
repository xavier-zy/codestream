"use strict";

import { Logger } from "../logger";
import { PixieDynamicLoggingReponse, PixieDynamicLoggingRequest, PixieDynamicLoggingRequestType } from "../protocol/agent.protocol";
import { CodeStreamSession } from "../session";
import { lsp, lspHandler } from "../system/decorators/lsp";
import * as grpcProtoLoader from "@grpc/proto-loader";
import * as grpcLibrary from "@grpc/grpc-js";
import * as protobuf from "protobufjs";
import Long from "long";
import { xfs } from "../xfs";

// see: https://www.npmjs.com/package/protobufjs
protobuf.util.Long = Long;
protobuf.configure();

const DYNAMIC_LOGGING_SCRIPT_TEMPLATE = `
import pxtrace
import px

upid = '00000004-0000-3d9e-0000-000001e9f7b4'

@pxtrace.probe("main.$FUNCTION_NAME$")
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
        const cloudApiProto = await grpcProtoLoader.load("/Users/mfarias/pixie/cloudapi.proto");
        const cloudApiPackage = grpcLibrary.loadPackageDefinition(cloudApiProto);
        const cloudApi = cloudApiPackage.px as any;

        const vizierApiProto = await grpcProtoLoader.load("/Users/mfarias/pixie/vizierapi.proto");
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
        const script = DYNAMIC_LOGGING_SCRIPT_TEMPLATE
            .replace(/\$FUNCTION_NAME\$/g, request.functionName)
            .replace(/\$TRACEPOINT_NAME\$/g, `${request.functionName}_data_${Date.now()}`)
            .replace(/\$FUNCTION_PARAMETERS\$/g, parametersScript);

        const recentArgs: number[] = [];

        const promise = new Promise<PixieDynamicLoggingReponse>((resolve, reject) => {
            function poller() {
                const call = vizier.executeScript({
                    queryStr: script,
                    clusterId: "0177fa38-31de-40f0-8dc0-79d73c05bc7d",
                    mutation: true
                });
                call.on("data", function(response: any) {
                    if (
                        response.data &&
                        response.data.batch &&
                        response.data.batch.cols[3] &&
                        response.data.batch.cols[3].int64Data.data
                    ) {
                        recentArgs.push(response.data.batch.cols[3].int64Data.data[0].low);
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
                    if (recentArgs.length) {
                        resolve({
                            recentArgs
                        });
                        Logger.log("this is the end, my only friend, the end");
                    } else {
                        Logger.log("nothing so far");
                        setTimeout(poller, 5000)
                    }
                });
            }
            poller();
        });

        return promise;
    }

    private async buildCredentials() {
        const token = (await xfs.readText("/Users/mfarias/pixie/pixie.key"))!.trim();
        return grpcLibrary.credentials.combineChannelCredentials(
            grpcLibrary.credentials.createSsl(),
            grpcLibrary.credentials.createFromMetadataGenerator((params, callback) => {
                const md = new grpcLibrary.Metadata();
                md.set("authorization", "Bearer " + token);
                md.set("pixie-api-key", token);
                md.set("pixie-api-client", "codestream");
                return callback(null, md);
            })
        );
    }
}
