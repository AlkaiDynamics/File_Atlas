/**
 * D3 mock for CommonJS tests
 */

module.exports = {
  select: jest.fn(() => ({
    selectAll: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    attr: jest.fn().mockReturnThis(),
    style: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    call: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    data: jest.fn().mockReturnThis(),
    enter: jest.fn().mockReturnThis()
  })),
  zoom: jest.fn(() => ({
    scaleExtent: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis()
  })),
  cluster: jest.fn(() => ({
    size: jest.fn().mockReturnThis(),
    separation: jest.fn().mockReturnThis()
  })),
  drag: jest.fn(() => ({
    on: jest.fn().mockReturnThis()
  })),
  zoomIdentity: {
    k: 1,
    x: 0,
    y: 0
  }
};
