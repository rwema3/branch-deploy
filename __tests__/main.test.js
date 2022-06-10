import {run} from '../src/main'
import * as reactEmote from '../src/functions/react-emote'
import * as contextCheck from '../src/functions/context-check'
import * as prechecks from '../src/functions/prechecks'
import * as validPermissions from '../src/functions/valid-permissions'
import * as lock from '../src/functions/lock'
import * as actionStatus from '../src/functions/action-status'
import * as github from '@actions/github'
import * as core from '@actions/core'

const setOutputMock = jest.spyOn(core, 'setOutput')
const saveStateMock = jest.spyOn(core, 'saveState')
const setFailedMock = jest.spyOn(core, 'setFailed')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(core, 'setOutput').mockImplementation(() => {})
  jest.spyOn(core, 'setFailed').mockImplementation(() => {})
  jest.spyOn(core, 'saveState').mockImplementation(() => {})
  jest.spyOn(core, 'info').mockImplementation(() => {})
  jest.spyOn(core, 'warning').mockImplementation(() => {})
  process.env.INPUT_GITHUB_TOKEN = 'faketoken'
  process.env.INPUT_TRIGGER = '.deploy'
  process.env.INPUT_REACTION = 'eyes'
  process.env.INPUT_PREFIX_ONLY = 'true'
  process.env.INPUT_ENVIRONMENT = 'production'
  process.env.INPUT_STABLE_BRANCH = 'main'
  process.env.INPUT_NOOP_TRIGGER = 'noop'
  process.env.INPUT_LOCK_TRIGGER = '.lock'
  process.env.INPUT_REQUIRED_CONTEXTS = 'false'
  process.env.GITHUB_REPOSITORY = 'corp/test'
  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.deploy',
      id: 123
    }
  }

  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        repos: {
          createDeployment: jest.fn().mockImplementation(() => {
            return {data: {id: 123}}
          }),
          createDeploymentStatus: jest.fn().mockImplementation(() => {
            return {data: {}}
          })
        },
        pulls: {
          get: jest.fn().mockImplementation(() => {
            return {data: {head: {ref: 'test-ref'}}, status: 200}
          })
        }
      }
    }
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return true
  })
  jest.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return true
  })
  jest.spyOn(reactEmote, 'reactEmote').mockImplementation(() => {
    return {data: {id: '123'}}
  })
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: false
    }
  })
})

test('successfully runs the action', async () => {
  expect(await run()).toBe('success')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', 'false')
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', 'false')
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('deployment_id', 123)
})

test('fails due to multiple commands in one message', async () => {
  process.env.INPUT_PREFIX_ONLY = 'false'
  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.deploy .lock'
    }
  }
  expect(await run()).toBe('failure')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy .lock')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'false')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    'IssueOps message contains multiple commands, only one is allowed'
  )
})

test('successfully runs the action in noop mode', async () => {
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: true
    }
  })
  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.deploy noop',
      id: 123
    }
  }
  expect(await run()).toBe('success - noop')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy noop')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', 'true')
})

test('runs the action in lock mode and fails due to bad permissions', async () => {
  const permissionsMsg =
    '👋 __monalisa__, seems as if you have not admin/write permissions in this repo, permissions: read'
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return permissionsMsg
  })
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.lock',
      id: 123
    }
  }
  expect(await run()).toBe('failure')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.lock')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setFailedMock).toHaveBeenCalledWith(permissionsMsg)
})

test('successfully runs the action in lock mode', async () => {
  jest.spyOn(validPermissions, 'validPermissions').mockImplementation(() => {
    return true
  })
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return true
  })
  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.lock --reason testing a new feature',
      id: 123
    }
  }
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith(
    'comment_body',
    '.lock --reason testing a new feature'
  )
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'lock')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('fails to aquire the lock on a deploy so it exits', async () => {
  jest.spyOn(lock, 'lock').mockImplementation(() => {
    return false
  })
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
})

test('successfully runs the action after trimming the body', async () => {
  jest.spyOn(prechecks, 'prechecks').mockImplementation(comment => {
    expect(comment).toBe('.deploy noop')

    return {
      ref: 'test-ref',
      status: true,
      message: '✔️ PR is approved and all CI checks passed - OK',
      noopMode: true
    }
  })
  github.context.payload = {
    issue: {
      number: 123
    },
    comment: {
      body: '.deploy noop    \n\t\n   '
    }
  }
  expect(await run()).toBe('success - noop')
  // other expects are similar to previous tests.
})

test('successfully runs the action with required contexts', async () => {
  process.env.INPUT_REQUIRED_CONTEXTS = 'lint,test,build'
  expect(await run()).toBe('success')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', 'false')
  expect(setOutputMock).toHaveBeenCalledWith('continue', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', 'false')
})

test('detects an out of date branch and exits', async () => {
  jest.spyOn(github, 'getOctokit').mockImplementation(() => {
    return {
      rest: {
        repos: {
          createDeployment: jest.fn().mockImplementation(() => {
            return {data: {id: undefined, message: 'Auto-merged'}}
          }),
          createDeploymentStatus: jest.fn().mockImplementation(() => {
            return {data: {}}
          })
        }
      }
    }
  })
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('safe-exit')
  expect(setOutputMock).toHaveBeenCalledWith('comment_body', '.deploy')
  expect(setOutputMock).toHaveBeenCalledWith('triggered', 'true')
  expect(setOutputMock).toHaveBeenCalledWith('comment_id', 123)
  expect(setOutputMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(setOutputMock).toHaveBeenCalledWith('noop', 'false')
  expect(setOutputMock).toHaveBeenCalledWith('type', 'deploy')
  expect(saveStateMock).toHaveBeenCalledWith('isPost', 'true')
  expect(saveStateMock).toHaveBeenCalledWith('actionsToken', 'faketoken')
  expect(saveStateMock).toHaveBeenCalledWith('environment', 'production')
  expect(saveStateMock).toHaveBeenCalledWith('comment_id', 123)
  expect(saveStateMock).toHaveBeenCalledWith('ref', 'test-ref')
  expect(saveStateMock).toHaveBeenCalledWith('noop', 'false')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
})

test('fails due to a bad context', async () => {
  jest.spyOn(contextCheck, 'contextCheck').mockImplementation(() => {
    return false
  })
  expect(await run()).toBe('safe-exit')
})

test('fails due to no trigger being found', async () => {
  process.env.INPUT_TRIGGER = '.shipit'
  expect(await run()).toBe('safe-exit')
})

test('fails prechecks', async () => {
  jest.spyOn(prechecks, 'prechecks').mockImplementation(() => {
    return {
      ref: 'test-ref',
      status: false,
      message: '### ⚠️ Cannot proceed with deployment... something went wrong',
      noopMode: false
    }
  })
  jest.spyOn(actionStatus, 'actionStatus').mockImplementation(() => {
    return undefined
  })
  expect(await run()).toBe('failure')
  expect(saveStateMock).toHaveBeenCalledWith('bypass', 'true')
  expect(setFailedMock).toHaveBeenCalledWith(
    '### ⚠️ Cannot proceed with deployment... something went wrong'
  )
})

test('handles and unexpected error and exits', async () => {
  github.context.payload = {}
  try {
    await run()
  } catch (e) {
    expect(setFailedMock.toHaveBeenCalled())
  }
})
