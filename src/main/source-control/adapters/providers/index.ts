/**
 * Provider Adapters
 *
 * This module exports all provider adapters and the provider factory.
 *
 * Current Providers:
 * - GitHub (GitHubProviderAdapter)
 *
 * Future Providers:
 * - GitLab (GitLabProviderAdapter)
 * - Bitbucket (BitbucketProviderAdapter)
 * - Azure DevOps (AzureDevOpsProviderAdapter)
 */

export { GitHubProviderAdapter } from './github-provider-adapter'
export { ProviderFactoryService, ProviderFactory } from './provider-factory-service'
