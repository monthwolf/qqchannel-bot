/**
 * @typedef { import('../../../interface/config').IPluginConfig} IPluginConfig
 * @type {IPluginConfig}
 */
module.exports = {
  id: 'io.paotuan.plugin.example',
  name: '插件 test',
  version: 1,
  customReply: [
    {
      id: 'ex1',
      name: 'aaa',
      command: 'ptest',
      trigger: 'exact',
      items: [
        {
          weight: 1,
          reply: 'hello world'
        }
      ]
    }
  ]
}
