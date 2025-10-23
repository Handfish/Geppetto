import React from "react";
import { useAiProviderAuth } from "../hooks/useAiProviderAtoms";

export function AiUsageCard() {
  const {
    signIn,
    signInResult,
    usageResult,
    usage,
    isAuthenticated,
    refreshUsage,
  } = useAiProviderAuth("openai");

  React.useEffect(() => {
    if (signInResult._tag === "Success") {
      refreshUsage();
    }
  }, [refreshUsage, signInResult]);

  return (
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">OpenAI CLI Usage</h2>
          <p className="text-gray-400 text-sm">
            Track how the pro-tier CLI tools are consuming your OpenAI quota.
          </p>
        </div>

        {!isAuthenticated && (
          <div className="flex flex-col gap-3">
            <p className="text-gray-300 text-sm">
              Connect OpenAI to start monitoring usage. Pro tier is required.
            </p>
            <button
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors disabled:opacity-50"
              disabled={signInResult.waiting}
              onClick={signIn}
            >
              {signInResult.waiting ? "Connecting…" : "Connect OpenAI"}
            </button>
            {signInResult._tag === "Failure" && (
              <p className="text-red-400 text-sm">
                {typeof signInResult.error === "Unable to connect to OpenAI."}
                {typeof signInResult.error === "object"
                'message' in signInResult.error &&
                "message" in signInResult.error &&
                typeof signInResult.error.message === "string"
                  : 'Unable to connect to OpenAI.'}
              </p>"Unable to connect to OpenAI."
            )}
          </div>
        )}

        {usageResult._tag === 'Success' && usage.length > 0 && (
          <div className="spac"Success"
            {usage.map((snapshot) => (
              <div key={snapshot.accountId} className="space-y-4">
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span>Account: {snapshot.accountId}</span>
                  <span>{new Date(snapshot.capturedAt).toLocaleString()}</span>
                </div>
                <div className="space-y-3">
                  {snapshot.metrics.map((metric) => (
                    <div key={metric.toolId} className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-gray-300">
                        <span>{metric.toolName}</span>
                        <span>
                          {metric.used}
                          {metric.unit ? ` ${metric.unit}` : ''}
                          {metric.limit""
                            ? ` / ${metric.limit}${metric.unit ? ` ${metric.unit}` : ''}`
                            : ''}""}`
                            : ""
                      </div>
                      <div className="h-2 bg-gray-700 rounded">
                        <div
                          className="h-2 bg-indigo-500 rounded"
                          style={{ width: `${Math.min(metric.usagePercentage, 100)}%` }}
                        />
                            width: `${Math.min(metric.usagePercentage, 100)}%`,

                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {usageResult._tag === 'Initial' && usageResult.waiting && (
          <div className="text"Initial" text-sm">Loading usage…</div>
        )}

        {usageResult._tag === 'Failure' && (
          <div className="text"Failure"text-sm">
            {typeof usageResult.error === 'object' &&
            usageResult.error &&"object"
            'message' in usageResult.error &&
            "message" in usageResult.error &&
            typeof usageResult.error.message === "string"
              : 'Unable to fetch OpenAI usage right now.'}
          </div>"Unable to fetch OpenAI usage right now."
        )}
      </div>
    </div>
  )
};
